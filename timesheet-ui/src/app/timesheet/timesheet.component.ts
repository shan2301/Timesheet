import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';
import { UserService } from '../services/user.service';

export type UserProjectOption = { id: number; name: string };
export type TaskOption = { id: number; name: string };

type WeekEntry = {
  projectId: number;
  taskMasterId: number;
  workDate: string; // yyyy-mm-dd
  hours: number;
  comment: string;
};

function mapById<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((x) => [x.id, x]));
}

@Component({
  selector: 'app-timesheet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './timesheet.component.html',
})
export class TimesheetComponent implements OnInit {
  readonly projects = signal<UserProjectOption[]>([]);
  readonly tasks = signal<TaskOption[]>([]);

  /** ISO week key: YYYY-Www */
  readonly weekKey = signal<string>('');
  readonly weekStart = signal<string>(''); // yyyy-mm-dd (Monday)
  readonly weekEnd = signal<string>(''); // yyyy-mm-dd (Sunday)
  readonly status = signal<string>('Draft'); // Draft | Submitted | Approved | Rejected

  readonly entries = signal<WeekEntry[]>([]);
  readonly listError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  currentProjectId: string | number = '';
  newRow: { taskMasterId: string | number; workDate: string; hours: number; comment: string } = {
    taskMasterId: '',
    workDate: '',
    hours: 0,
    comment: '',
  };

  constructor(
    private tsService: TimesheetService,
    private userService: UserService
  ) {}

  ngOnInit() {
    this.loadProjects();
    this.loadTasks();
    this.initCurrentWeek();
  }

  loadProjects() {
    this.userService.getUserProjects().subscribe({
      next: (res) => {
        const raw = Array.isArray(res) ? res : [];
        this.projects.set(
          raw.map((x: any) => ({
            id: Number(x.id ?? x.Id ?? x.projectId ?? x.ProjectId ?? 0),
            name: String(x.name ?? x.Name ?? ''),
          }))
        );
      },
      error: () => {
        this.projects.set([]);
      },
    });
  }

  loadTasks() {
    this.userService.getActiveTasks().subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res : (res?.data ?? res?.$values ?? []);
        const list = Array.isArray(raw) ? raw : [];
        this.tasks.set(
          list
            .map((x: any) => ({
              id: Number(x.id ?? x.Id ?? 0),
              name: String(x.name ?? x.Name ?? ''),
              isActive: Boolean(x.isActive ?? x.IsActive ?? true),
            }))
            .filter((x: any) => x.id > 0 && x.isActive)
            .map((x: any) => ({ id: x.id, name: x.name }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
        );
      },
      error: () => this.tasks.set([]),
    });
  }

  initCurrentWeek() {
    const today = new Date();
    const monday = this.toMonday(today);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    this.weekStart.set(this.toYmd(monday));
    this.weekEnd.set(this.toYmd(sunday));
    this.weekKey.set(this.toIsoWeekKey(monday));
    this.loadWeek();
  }

  private toMonday(d: Date): Date {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay(); // 0-6 (Sun-Sat)
    const diff = (7 + day - 1) % 7; // Monday=1
    date.setDate(date.getDate() - diff);
    return date;
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private addDays(ymd: string, days: number): string {
    const d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return this.toYmd(d);
  }

  /**
   * Parses ISO week key (YYYY-Www) and sets weekStart/weekEnd (Mon→Sun).
   * HTML input type="week" uses ISO week numbering.
   */
  setWeekFromKey(value: string) {
    if (!value) return;
    const monday = this.isoWeekKeyToMonday(value);
    if (!monday) return;
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    this.weekKey.set(value);
    this.weekStart.set(this.toYmd(monday));
    this.weekEnd.set(this.toYmd(sunday));
    this.loadWeek();
  }

  weekDays(): { date: string; label: string }[] {
    const start = this.weekStart();
    if (!start) return [];
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names.map((n, idx) => {
      const d = this.addDays(start, idx);
      return { date: d, label: `${n} (${d})` };
    });
  }

  totalWeekHours(): number {
    return this.entries().reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  }

  dayTotals(): { date: string; hours: number }[] {
    const map = new Map<string, number>();
    for (const e of this.entries()) {
      const d = e.workDate;
      if (!d) continue;
      map.set(d, (map.get(d) || 0) + (Number(e.hours) || 0));
    }
    return Array.from(map.entries())
      .map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  canSubmit(): boolean {
    return this.status() === 'Draft' && this.entries().length > 0;
  }

  loadWeek() {
    this.actionError.set(null);
    this.listError.set(null);
    const ws = this.weekStart();
    if (!ws) return;
    this.tsService.getMyWeek(ws).subscribe({
      next: (res: any) => {
        this.status.set(String(res?.status ?? res?.Status ?? 'Draft'));
        const wsd = String(res?.weekStartDate ?? res?.WeekStartDate ?? ws).slice(0, 10);
        const wed = String(res?.weekEndDate ?? res?.WeekEndDate ?? this.weekEnd()).slice(0, 10);
        this.weekStart.set(wsd);
        this.weekEnd.set(wed);
        // keep weekKey in sync (based on Monday date)
        const monday = new Date(wsd + 'T00:00:00');
        if (!Number.isNaN(monday.getTime())) this.weekKey.set(this.toIsoWeekKey(monday));
        const raw = Array.isArray(res?.entries) ? res.entries : (res?.entries?.$values ?? []);
        const list = Array.isArray(raw) ? raw : [];
        this.entries.set(
          list.map((x: any) => ({
            projectId: Number(x.projectId ?? x.ProjectId ?? 0),
            taskMasterId: Number(x.taskMasterId ?? x.TaskMasterId ?? 0),
            workDate: String(x.workDate ?? x.WorkDate ?? '').slice(0, 10),
            hours: Number(x.hours ?? x.Hours ?? 0),
            comment: String(x.comment ?? x.Comment ?? ''),
          }))
        );
      },
      error: () => {
        this.listError.set('Failed to load this week.');
        this.entries.set([]);
        this.status.set('Draft');
      },
    });
  }

  resetRow() {
    this.newRow = { taskMasterId: '', workDate: '', hours: 0, comment: '' };
    this.actionError.set(null);
  }

  private selectedCurrentProjectId(): number {
    const v = this.currentProjectId;
    const n = typeof v === 'string' ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  addEntry() {
    this.actionError.set(null);
    if (this.status() !== 'Draft') {
      this.actionError.set('This week is already submitted.');
      return;
    }
    const projectId = this.selectedCurrentProjectId();
    if (projectId <= 0) {
      this.actionError.set('Select a project.');
      return;
    }
    const taskId =
      typeof this.newRow.taskMasterId === 'string'
        ? Number(this.newRow.taskMasterId)
        : Number(this.newRow.taskMasterId);
    if (taskId <= 0) {
      this.actionError.set('Select a task.');
      return;
    }
    if (!this.newRow.workDate) {
      this.actionError.set('Select a date in this week.');
      return;
    }
    if (this.newRow.hours <= 0) {
      this.actionError.set('Hours must be > 0.');
      return;
    }

    const next: WeekEntry[] = [
      ...this.entries(),
      {
        projectId,
        taskMasterId: taskId,
        workDate: this.newRow.workDate,
        hours: Number(this.newRow.hours),
        comment: this.newRow.comment ?? '',
      },
    ];
    this.entries.set(next);
    this.resetRow();
  }

  removeEntry(idx: number) {
    if (this.status() !== 'Draft') return;
    const next = [...this.entries()];
    next.splice(idx, 1);
    this.entries.set(next);
  }

  projectName(projectId: number): string {
    const p = mapById(this.projects()).get(projectId);
    return p ? p.name : `#${projectId}`;
  }

  taskName(taskId: number): string {
    const t = mapById(this.tasks()).get(taskId);
    return t ? t.name : `#${taskId}`;
  }

  private toIsoWeekKey(date: Date): string {
    const { year, week } = this.getIsoWeekYearAndNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private isoWeekKeyToMonday(key: string): Date | null {
    // key like "2026-W17"
    const m = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!m) return null;
    const year = Number(m[1]);
    const week = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;

    // ISO week 1 is the week with Jan 4th in it.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));

    const targetMonday = new Date(week1Monday);
    targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

    // Convert back to local date (still midnight)
    const local = new Date(
      targetMonday.getUTCFullYear(),
      targetMonday.getUTCMonth(),
      targetMonday.getUTCDate()
    );
    local.setHours(0, 0, 0, 0);
    return local;
  }

  private getIsoWeekYearAndNumber(date: Date): { year: number; week: number } {
    // Work in UTC to avoid DST issues.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to Thursday of current week to determine week-year.
    const day = d.getUTCDay() || 7; // 1..7
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const year = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year, week };
  }

  saveDraft() {
    this.actionError.set(null);
    if (this.status() !== 'Draft') {
      this.actionError.set('This week is already submitted.');
      return;
    }
    const ws = this.weekStart();
    if (!ws) return;
    const payload = {
      weekStartDate: ws,
      entries: this.entries().map((e) => ({
        projectId: e.projectId,
        taskMasterId: e.taskMasterId,
        workDate: e.workDate,
        hours: e.hours,
        comment: e.comment,
      })),
    };
    this.tsService.saveWeek(payload).subscribe({
      next: () => this.loadWeek(),
      error: (err) => this.actionError.set(err?.error?.message || 'Failed to save draft.'),
    });
  }

  submitWeek() {
    this.actionError.set(null);
    const ws = this.weekStart();
    if (!ws) return;
    if (!this.canSubmit()) {
      this.actionError.set('Add at least one row before submitting.');
      return;
    }
    this.tsService.submitWeek(ws).subscribe({
      next: () => this.loadWeek(),
      error: (err) => this.actionError.set(err?.error?.message || 'Failed to submit week.'),
    });
  }
}

