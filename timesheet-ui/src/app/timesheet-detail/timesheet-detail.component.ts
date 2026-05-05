import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

type Header = {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  submittedAt: string | null;
  approvedOn: string | null;
  totalHours: number;
};

type Entry = {
  workDate: string;
  projectName: string;
  taskName: string;
  hours: number;
  comment: string;
};

function parseObj(res: any): any {
  if (!res || typeof res !== 'object') return {};
  // API returns { header, entries, totalHours } on /{id}
  return res;
}

function normHeader(raw: any): Header {
  const h = raw?.header ?? raw?.Header ?? raw ?? {};
  const ws = String(h.weekStartDate ?? h.WeekStartDate ?? '').slice(0, 10);
  const we = String(h.weekEndDate ?? h.WeekEndDate ?? '').slice(0, 10);
  return {
    id: Number(h.id ?? h.Id ?? raw?.id ?? raw?.Id ?? 0),
    weekStartDate: ws,
    weekEndDate: we,
    status: String(h.status ?? h.Status ?? 'Submitted'),
    submittedAt: h.submittedAt ? String(h.submittedAt) : (h.SubmittedAt ? String(h.SubmittedAt) : null),
    approvedOn: h.approvedOn ? String(h.approvedOn) : (h.ApprovedOn ? String(h.ApprovedOn) : null),
    totalHours: Number(raw?.totalHours ?? raw?.TotalHours ?? 0),
  };
}

function normEntries(raw: any): Entry[] {
  const list = Array.isArray(raw?.entries) ? raw.entries : (raw?.entries?.$values ?? []);
  const arr = Array.isArray(list) ? list : [];
  return arr.map((e: any) => ({
    workDate: String(e.workDate ?? e.WorkDate ?? '').slice(0, 10),
    projectName: String(e.projectName ?? e.ProjectName ?? ''),
    taskName: String(e.taskName ?? e.TaskName ?? ''),
    hours: Number(e.hours ?? e.Hours ?? 0),
    comment: String(e.comment ?? e.Comment ?? ''),
  }));
}

@Component({
  selector: 'app-timesheet-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="stack" style="gap: 10px;">
      <div class="navcrumb">
        <a class="navcrumb" routerLink="/dashboard">Dashboard</a>
        <span class="navcrumb-sep">›</span>
        <a class="navcrumb" routerLink="/timesheets">My Timesheets</a>
        <span class="navcrumb-sep">›</span>
        <span>Submission #{{ header()?.id || id() }}</span>
      </div>

      <div class="card card-soft">
        <div class="card-header" style="align-items:flex-start;">
          <div>
            <div class="h2">Timesheet details</div>
            <div class="muted">{{ header()?.weekStartDate | date : 'dd-MMM-yyyy' }} → {{ header()?.weekEndDate | date : 'dd-MMM-yyyy' }}</div>
          </div>
          <div class="actions" style="gap:10px;">
            <button class="btn" type="button" (click)="export()" [disabled]="exportBusy() || header()?.status !== 'Approved'">
              {{ exportBusy() ? 'Exporting…' : 'Export Excel' }}
            </button>
            <button class="btn" type="button" (click)="reload()" [disabled]="busy()">Refresh</button>
          </div>
        </div>

        <div class="card-body">
          <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">{{ error() }}</div>

          <div class="row" style="gap: 10px; flex-wrap: wrap;" *ngIf="header() as h">
            <span class="pill" [class.active]="h.status === 'Approved'" [class.inactive]="h.status === 'Rejected'" [class.pending]="h.status === 'Submitted'">
              {{ h.status }}
            </span>
            <span class="pill" style="background: rgba(255,255,255,0.75);">Total: {{ h.totalHours }}h</span>
            <span class="pill" style="background: rgba(255,255,255,0.75);">Submitted: {{ h.submittedAt ? (h.submittedAt | date : 'dd-MMM-yyyy, h:mm a') : '—' }}</span>
            <span class="pill" style="background: rgba(255,255,255,0.75);">Approved: {{ h.approvedOn ? (h.approvedOn | date : 'dd-MMM-yyyy, h:mm a') : '—' }}</span>
          </div>

          <div class="divider"></div>

          <table class="table" *ngIf="entries().length; else empty">
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
                <td>{{ e.projectName }}</td>
                <td>{{ e.taskName }}</td>
                <td>{{ e.hours }}</td>
                <td>{{ e.comment || '—' }}</td>
              </tr>
            </tbody>
          </table>

          <ng-template #empty>
            <div class="subtitle">No entries found.</div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
})
export class TimesheetDetailComponent implements OnInit {
  readonly id = signal(0);
  readonly busy = signal(false);
  readonly exportBusy = signal(false);
  readonly error = signal<string | null>(null);

  readonly header = signal<Header | null>(null);
  readonly entries = signal<Entry[]>([]);

  readonly canExport = computed(() => (this.header()?.status ?? '') === 'Approved');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ts: TimesheetService
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id') || 0);
    this.id.set(id);
    if (!id) {
      this.router.navigateByUrl('/timesheets');
      return;
    }
    this.reload();
  }

  reload() {
    this.busy.set(true);
    this.error.set(null);
    const id = this.id();
    this.ts.getWeeklyTimesheetById(id).subscribe({
      next: (res) => {
        const obj = parseObj(res);
        this.header.set(normHeader(obj));
        this.entries.set(normEntries(obj));
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load timesheet.');
        this.header.set(null);
        this.entries.set([]);
      },
      complete: () => this.busy.set(false),
    });
  }

  export() {
    if (!this.canExport()) return;
    this.exportBusy.set(true);
    this.error.set(null);
    const id = this.id();
    this.ts.exportWeeklyById(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WeeklyTimesheet-${id}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportBusy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Could not export Excel.');
        this.exportBusy.set(false);
      },
    });
  }
}

