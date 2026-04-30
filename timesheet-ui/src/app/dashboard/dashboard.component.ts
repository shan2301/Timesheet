import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Chart } from 'chart.js/auto';
import { AuthService } from '../services/auth';
import { LeaveService } from '../services/leave.service';
import { TimesheetService } from '../services/timesheet.service';
import { UsersService } from '../services/users.service';

type ProjectHoursRow = { projectId: number; projectName: string; hours: number };
type LeaveBalanceRow = { type: string; maxUnitsPerYear: number | null; usedUnits: number; availableUnits: number | null; year: number };
type MyLeaveRow = { id: number; startDate: string; endDate: string; type: string; units: number; status: string; createdAt: string };

function parseList(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  return [];
}

function normProjectHours(raw: any): ProjectHoursRow {
  return {
    projectId: Number(raw.projectId ?? raw.ProjectId ?? raw.id ?? raw.Id ?? 0),
    projectName: String(raw.projectName ?? raw.ProjectName ?? raw.name ?? raw.Name ?? ''),
    hours: Number(raw.hours ?? raw.Hours ?? raw.totalHours ?? raw.TotalHours ?? 0),
  };
}

function normMyLeave(raw: any): MyLeaveRow {
  return {
    id: Number(raw.id ?? raw.Id ?? 0),
    startDate: String(raw.startDate ?? raw.StartDate ?? ''),
    endDate: String(raw.endDate ?? raw.EndDate ?? ''),
    type: String(raw.type ?? raw.Type ?? ''),
    units: Number(raw.units ?? raw.Units ?? 1),
    status: String(raw.status ?? raw.Status ?? 'Pending'),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
  };
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  CasualLeave: 'Casual Leave',
  HalfCasualLeave: 'Half Casual Leave',
  MedicalLeave: 'Medical Leave',
  HalfMedicalLeave: 'Half Medical Leave',
  UnpaidLeave: 'Unpaid Leave',
  UnpaidHalfDayLeave: 'Unpaid Half Day Leave',
};

function leaveLabel(type: string): string {
  return LEAVE_TYPE_LABELS[type] || type;
}

function toMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0-6 (Sun-Sat)
  const diff = (7 + day - 1) % 7; // Monday=1
  date.setDate(date.getDate() - diff);
  return date;
}

function toYmd(d: Date): string {
  const dd = new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  role: 'Admin' | 'Manager' | 'Employee' | null = null;
  readonly stats = signal({
    activeUsers: 0,
    pendingTimesheets: 0,
    pendingLeaveRequests: 0,
  });
  // Manager dashboard state (weekly approvals + leave inbox)
  readonly mgrWeekly = signal({ total: 0, submitted: 0, approved: 0, rejected: 0 });
  readonly mgrLeaves = signal({ total: 0, pending: 0, approved: 0, rejected: 0 });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Employee dashboard state
  readonly empWeek = signal({
    weekStartDate: '',
    weekEndDate: '',
    status: 'Draft',
    entryCount: 0,
    totalHours: 0,
    submittedAt: '' as string | null,
  });
  readonly empLeaveBalances = signal<LeaveBalanceRow[]>([]);
  readonly empLeaveCounts = signal({ pending: 0, approved: 0, rejected: 0, total: 0 });
  readonly empRecentLeaves = signal<MyLeaveRow[]>([]);
  readonly leaveLabel = leaveLabel;

  @ViewChild('projectHoursCanvas') projectHoursCanvas?: ElementRef<HTMLCanvasElement>;
  private projectHoursChart: Chart | null = null;
  readonly loadingChart = signal(false);
  readonly chartError = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private leaveService: LeaveService,
    private timesheetService: TimesheetService
  ) {}

  ngOnInit() {
    this.role = this.normalizeRole(this.authService.getUserRole());
    this.loadStats();
    if (this.role === 'Admin' || this.role === 'Manager') {
      // Defer to next tick so ViewChild is available.
      setTimeout(() => this.loadProjectHours(), 0);
    }
  }

  ngOnDestroy() {
    this.projectHoursChart?.destroy();
    this.projectHoursChart = null;
  }

  loadStats() {
    this.loading.set(true);
    this.error.set(null);

    const role = this.role;

    if (role === 'Manager') {
      this.loadManagerDashboard();
      this.loading.set(false);
      return;
    }

    if (role === 'Employee') {
      this.loadEmployeeDashboard();
      this.loading.set(false);
      return;
    }

    if (role !== 'Admin') {
      this.loading.set(false);
      return;
    }

    let activeUsers = 0;
    let pendingTimesheets = 0;

    this.usersService.getUsers().subscribe({
      next: (users: any) => {
        const list = Array.isArray(users) ? users : users?.data || [];
        activeUsers = list.filter((u: any) => u.isActive).length;

        this.timesheetService.getAllAdmin().subscribe({
          next: (ts: any) => {
            const tList = Array.isArray(ts) ? ts : ts?.data || [];
            pendingTimesheets = tList.filter((t: any) => t.status === 'Pending').length;

            this.stats.set({
              activeUsers,
              pendingTimesheets,
              pendingLeaveRequests: 0,
            });
          },
          error: () => {
            this.error.set('Failed to load timesheet stats.');
          },
          complete: () => this.loading.set(false),
        });
      },
      error: () => {
        this.error.set('Failed to load user stats.');
        this.loading.set(false);
      },
    });
  }

  private loadManagerDashboard() {
    // Weekly approvals inbox (Submitted/Approved/Rejected)
    this.timesheetService.getManagerWeeklyTimesheets().subscribe({
      next: (res: any) => {
        const rows = parseList(res);
        const submitted = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Submitted').length;
        const approved = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Approved').length;
        const rejected = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Rejected').length;
        const total = rows.length;
        this.mgrWeekly.set({ total, submitted, approved, rejected });
      },
      error: () => {
        this.error.set('Failed to load timesheet submissions.');
        this.mgrWeekly.set({ total: 0, submitted: 0, approved: 0, rejected: 0 });
      },
    });

    // Leave inbox (Pending/Approved/Rejected)
    this.leaveService.inboxLeaves().subscribe({
      next: (res: any) => {
        const rows = parseList(res);
        const pending = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Pending').length;
        const approved = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Approved').length;
        const rejected = rows.filter((x: any) => String(x?.status ?? x?.Status ?? '') === 'Rejected').length;
        const total = rows.length;
        this.mgrLeaves.set({ total, pending, approved, rejected });
      },
      error: () => {
        this.error.set(this.error() || 'Failed to load leave inbox.');
        this.mgrLeaves.set({ total: 0, pending: 0, approved: 0, rejected: 0 });
      },
    });
  }

  private loadEmployeeDashboard() {
    const monday = toMonday(new Date());
    const weekStartYmd = toYmd(monday);

    // Weekly timesheet summary
    this.timesheetService.getMyWeek(weekStartYmd).subscribe({
      next: (res: any) => {
        const entries = parseList(res?.entries ?? res?.Entries);
        const totalHours = entries.reduce((sum, e) => sum + Number(e?.hours ?? e?.Hours ?? 0), 0);
        const status = String(res?.status ?? res?.Status ?? 'Draft');
        const weekStart = String(res?.weekStartDate ?? res?.WeekStartDate ?? weekStartYmd);
        const weekEnd = String(res?.weekEndDate ?? res?.WeekEndDate ?? '');
        const submittedAt = (res?.submittedAt ?? res?.SubmittedAt ?? null) as any;

        this.empWeek.set({
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          status,
          entryCount: entries.length,
          totalHours,
          submittedAt: submittedAt ? String(submittedAt) : null,
        });
      },
      error: () => {
        // keep defaults
      },
    });

    // Leave balances
    this.leaveService.balance().subscribe({
      next: (res: any) => this.empLeaveBalances.set(parseList(res) as LeaveBalanceRow[]),
      error: () => this.empLeaveBalances.set([]),
    });

    // Recent leave requests + counts
    this.leaveService.myLeaves().subscribe({
      next: (res: any) => {
        const rows = parseList(res).map(normMyLeave);
        const pending = rows.filter((x) => x.status === 'Pending').length;
        const approved = rows.filter((x) => x.status === 'Approved').length;
        const rejected = rows.filter((x) => x.status === 'Rejected').length;
        this.empLeaveCounts.set({ pending, approved, rejected, total: rows.length });
        this.empRecentLeaves.set(
          [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5)
        );
      },
      error: () => {
        this.empLeaveCounts.set({ pending: 0, approved: 0, rejected: 0, total: 0 });
        this.empRecentLeaves.set([]);
      },
    });
  }

  private normalizeRole(raw: any): 'Admin' | 'Manager' | 'Employee' | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      const roles = raw.map(String).map((x) => x.trim());
      if (roles.includes('Admin')) return 'Admin';
      if (roles.includes('Manager')) return 'Manager';
      if (roles.includes('Employee')) return 'Employee';
      return null;
    }
    const s = String(raw);
    const roles = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (roles.includes('Admin')) return 'Admin';
    if (roles.includes('Manager')) return 'Manager';
    if (roles.includes('Employee')) return 'Employee';
    return null;
  }

  loadProjectHours() {
    if (!(this.role === 'Admin' || this.role === 'Manager')) return;

    this.loadingChart.set(true);
    this.chartError.set(null);
    this.timesheetService.getProjectHoursReport().subscribe({
      next: (res) => {
        const rows = parseList(res).map(normProjectHours).filter((x) => x.projectName);
        this.renderProjectHoursChart(rows);
      },
      error: (err) => {
        this.chartError.set(err?.error?.message || 'Failed to load project hours report.');
      },
      complete: () => this.loadingChart.set(false),
    });
  }

  private renderProjectHoursChart(rows: ProjectHoursRow[]) {
    const canvas = this.projectHoursCanvas?.nativeElement;
    if (!canvas) return;

    const labels = rows.map((r) => r.projectName);
    const values = rows.map((r) => r.hours);

    this.projectHoursChart?.destroy();

    this.projectHoursChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours',
            data: values,
            borderRadius: 10,
            backgroundColor: 'rgba(60, 116, 255, 0.45)',
            borderColor: 'rgba(60, 116, 255, 0.85)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        scales: {
          x: {
            ticks: { maxRotation: 40, minRotation: 0 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });
  }
}

