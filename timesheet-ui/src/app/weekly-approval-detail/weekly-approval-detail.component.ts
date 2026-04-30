import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

type Header = {
  id: number;
  userId: number;
  userName: string;
  email: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  submittedAt: string | null;
  approvedBy: number | null;
  approvedOn: string | null;
};

type Entry = {
  id: number;
  projectId: number;
  projectName: string;
  taskMasterId: number;
  taskName: string;
  workDate: string;
  hours: number;
  comment: string;
};

function parseList(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  return [];
}

function normHeader(raw: any): Header {
  return {
    id: Number(raw?.id ?? raw?.Id ?? 0),
    userId: Number(raw?.userId ?? raw?.UserId ?? 0),
    userName: String(raw?.userName ?? raw?.UserName ?? ''),
    email: String(raw?.email ?? raw?.Email ?? ''),
    weekStartDate: String(raw?.weekStartDate ?? raw?.WeekStartDate ?? ''),
    weekEndDate: String(raw?.weekEndDate ?? raw?.WeekEndDate ?? ''),
    status: String(raw?.status ?? raw?.Status ?? 'Submitted'),
    submittedAt: (raw?.submittedAt ?? raw?.SubmittedAt ?? null) as any,
    approvedBy: (raw?.approvedBy ?? raw?.ApprovedBy ?? null) as any,
    approvedOn: (raw?.approvedOn ?? raw?.ApprovedOn ?? null) as any,
  };
}

function normEntry(raw: any): Entry {
  return {
    id: Number(raw?.id ?? raw?.Id ?? 0),
    projectId: Number(raw?.projectId ?? raw?.ProjectId ?? 0),
    projectName: String(raw?.projectName ?? raw?.ProjectName ?? ''),
    taskMasterId: Number(raw?.taskMasterId ?? raw?.TaskMasterId ?? 0),
    taskName: String(raw?.taskName ?? raw?.TaskName ?? ''),
    workDate: String(raw?.workDate ?? raw?.WorkDate ?? ''),
    hours: Number(raw?.hours ?? raw?.Hours ?? 0),
    comment: String(raw?.comment ?? raw?.Comment ?? ''),
  };
}

@Component({
  selector: 'app-weekly-approval-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="stack" style="gap: 10px;">
      <div class="subtitle" style="margin: 0;">
        <a class="navcrumb" routerLink="/dashboard">Dashboard</a>
        <span class="navcrumb-sep">›</span>
        <a class="navcrumb" routerLink="/approve">Approvals</a>
        <span class="navcrumb-sep">›</span>
        <span style="font-weight: 800; color: rgba(0,0,0,0.80);">
          Submission #{{ header()?.id || timesheetId() || '—' }}
        </span>
      </div>

      <div class="card">
        <div class="header">
          <div>
            <h2 class="title">Timesheet submission</h2>
            <p class="subtitle">Review weekly timesheet entries.</p>
          </div>
        </div>

        <div class="card-body stack">
          <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ error() }}
          </div>
          <div *ngIf="busy()" class="subtitle">Loading…</div>

        <ng-container *ngIf="header()">
          <div class="grid-2-1" style="align-items: stretch;">
            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Employee</div>
                <div style="font-weight: 900; margin-top: 10px;">{{ header()!.userName }}</div>
                <div class="subtitle" style="margin-top: 6px;">{{ header()!.email }}</div>
                <div class="subtitle" style="margin-top: 10px;">#{{ header()!.userId }}</div>
              </div>
            </div>
            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Week</div>
                <div style="font-weight: 900; margin-top: 10px;">
                  {{ header()!.weekStartDate | date : 'dd-MMM-yyyy' }} → {{ header()!.weekEndDate | date : 'dd-MMM-yyyy' }}
                </div>
                <div style="margin-top: 10px;">
                  <span class="pill" [class.pending]="header()!.status === 'Submitted'" [class.active]="header()!.status === 'Approved'" [class.inactive]="header()!.status === 'Rejected'">
                    {{ header()!.status }}
                  </span>
                  <span class="subtitle" style="margin-left: 10px;">Total: {{ totalHours() }}</span>
                </div>
                <div class="subtitle" style="margin-top: 10px;">
                  Submitted: {{ header()!.submittedAt ? (header()!.submittedAt | date : 'dd-MMM-yyyy, h:mm a') : '—' }}
                </div>
              </div>
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Task</th>
                <th>Hours</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of entries()">
                <td>{{ e.workDate | date : 'dd-MMM-yyyy' }}</td>
                <td>
                  <div style="font-weight: 800;">{{ e.projectName || e.projectId }}</div>
                  <div class="subtitle" style="margin: 4px 0 0 0;">#{{ e.projectId }}</div>
                </td>
                <td>
                  <div style="font-weight: 800;">{{ e.taskName || e.taskMasterId }}</div>
                  <div class="subtitle" style="margin: 4px 0 0 0;">#{{ e.taskMasterId }}</div>
                </td>
                <td>{{ e.hours }}</td>
                <td style="max-width: 520px;">{{ e.comment || '—' }}</td>
              </tr>
            </tbody>
          </table>

          <div *ngIf="header()!.status === 'Submitted'; else reviewed" class="actions" style="justify-content: flex-start; margin-top: 10px;">
            <button class="btn btn-primary" type="button" (click)="approve()" [disabled]="busy() || header()!.status !== 'Submitted'">
              Approve
            </button>
            <button class="btn btn-danger" type="button" (click)="reject()" [disabled]="busy() || header()!.status !== 'Submitted'">
              Reject
            </button>
          </div>
          <ng-template #reviewed>
            <div class="subtitle" style="margin-top: 10px;">
              This submission has already been {{ header()!.status.toLowerCase() }}.
            </div>
          </ng-template>
          </ng-container>
        </div>
      </div>
    </div>
  `,
})
export class WeeklyApprovalDetailComponent implements OnInit {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly header = signal<Header | null>(null);
  readonly entries = signal<Entry[]>([]);
  readonly totalHours = signal<number>(0);
  readonly timesheetId = signal<number | null>(null);

  constructor(private route: ActivatedRoute, private ts: TimesheetService) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!id) {
      this.error.set('Invalid timesheet id.');
      return;
    }
    this.timesheetId.set(id);
    this.load(id);
  }

  private load(id: number) {
    this.busy.set(true);
    this.error.set(null);
    this.ts.getWeeklyTimesheetById(id).subscribe({
      next: (res: any) => {
        this.header.set(normHeader(res?.header ?? res?.Header));
        this.entries.set(parseList(res?.entries ?? res?.Entries).map(normEntry));
        this.totalHours.set(Number(res?.totalHours ?? res?.TotalHours ?? 0));
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load timesheet.');
        this.header.set(null);
        this.entries.set([]);
        this.totalHours.set(0);
      },
      complete: () => this.busy.set(false),
    });
  }

  approve() {
    const id = this.header()?.id;
    if (!id) return;
    this.busy.set(true);
    this.ts.approveWeeklyTimesheet(id).subscribe({
      next: () => this.load(id),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to approve.');
        this.busy.set(false);
      },
    });
  }

  reject() {
    const id = this.header()?.id;
    if (!id) return;
    this.busy.set(true);
    this.ts.rejectWeeklyTimesheet(id).subscribe({
      next: () => this.load(id),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to reject.');
        this.busy.set(false);
      },
    });
  }
}

