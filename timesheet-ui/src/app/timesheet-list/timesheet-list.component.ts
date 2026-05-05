import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

type Row = {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  submittedAt: string | null;
  approvedOn: string | null;
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

function normRow(raw: any): Row {
  const wsd = String(raw.weekStartDate ?? raw.WeekStartDate ?? '').slice(0, 10);
  const wed = String(raw.weekEndDate ?? raw.weekEndDate ?? raw.WeekEndDate ?? '').slice(0, 10);
  return {
    id: Number(raw.id ?? raw.Id ?? 0),
    weekStartDate: wsd,
    weekEndDate: wed,
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    submittedAt: raw.submittedAt ? String(raw.submittedAt) : (raw.SubmittedAt ? String(raw.SubmittedAt) : null),
    approvedOn: raw.approvedOn ? String(raw.approvedOn) : (raw.ApprovedOn ? String(raw.ApprovedOn) : null),
  };
}

@Component({
  selector: 'app-timesheet-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="stack" style="gap: 10px;">
      <div class="card card-soft">
        <div class="card-header" style="align-items:flex-start;">
          <div class="actions" style="gap:10px;">
            <select class="input" style="width:auto; min-width: 120px;" [value]="month()" (change)="month.set(+$any($event.target).value)">
              <option [value]="1">Jan</option>
              <option [value]="2">Feb</option>
              <option [value]="3">Mar</option>
              <option [value]="4">Apr</option>
              <option [value]="5">May</option>
              <option [value]="6">Jun</option>
              <option [value]="7">Jul</option>
              <option [value]="8">Aug</option>
              <option [value]="9">Sep</option>
              <option [value]="10">Oct</option>
              <option [value]="11">Nov</option>
              <option [value]="12">Dec</option>
            </select>
            <input class="input" style="width:auto; min-width: 110px;" type="number" [value]="year()" (change)="year.set(+$any($event.target).value)" />
            <button class="btn" type="button" (click)="exportMonth()" [disabled]="exportBusy()">
              {{ exportBusy() ? 'Exporting…' : 'Export month' }}
            </button>
            <button class="btn btn-primary" type="button" (click)="createNew()">Create timesheet</button>
            <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
          </div>
        </div>

        <div class="card-body">
          <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">{{ error() }}</div>

          <table class="table" *ngIf="rows().length; else empty">
            <thead>
              <tr>
                <th>Week</th>
                <th>Submitted</th>
                <th>Approved</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of rows()">
                <td>{{ r.weekStartDate | date : 'dd-MMM-yyyy' }} → {{ r.weekEndDate | date : 'dd-MMM-yyyy' }}</td>
                <td>{{ r.submittedAt ? (r.submittedAt | date : 'dd-MMM-yyyy, h:mm a') : '—' }}</td>
                <td>{{ r.approvedOn ? (r.approvedOn | date : 'dd-MMM-yyyy, h:mm a') : '—' }}</td>
                <td>
                  <span
                    class="pill"
                    [class.pending]="r.status === 'Draft' || r.status === 'Submitted'"
                    [class.active]="r.status === 'Approved'"
                    [class.inactive]="r.status === 'Rejected'"
                  >
                    {{ r.status }}
                  </span>
                </td>
                <td>
                  <button class="btn" type="button" (click)="view(r)">View</button>
                </td>
              </tr>
            </tbody>
          </table>

          <ng-template #empty>
            <div class="subtitle">No timesheets yet.</div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
})
export class TimesheetListComponent implements OnInit {
  readonly rows = signal<Row[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly exportBusy = signal(false);

  readonly year = signal<number>(new Date().getFullYear());
  readonly month = signal<number>(new Date().getMonth() + 1); // 1..12

  constructor(private ts: TimesheetService, private router: Router) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.ts.listMyWeeks().subscribe({
      next: (res) => this.rows.set(parseList(res).map(normRow)),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load timesheets.');
        this.rows.set([]);
      },
      complete: () => this.busy.set(false),
    });
  }

  createNew() {
    // Create/Edit page (lets user pick week, draft, submit)
    this.router.navigateByUrl('/timesheet/create');
  }

  exportMonth() {
    this.error.set(null);
    this.exportBusy.set(true);
    const y = this.year();
    const m = this.month();
    this.ts.exportMyMonthlyExcel(y, m).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Timesheet-${y}-${String(m).padStart(2, '0')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportBusy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Could not export month.');
        this.exportBusy.set(false);
      },
    });
  }

  view(r: Row) {
    const s = (r.status || '').toLowerCase();
    if (s === 'draft') {
      // Draft should open Create/Edit and prefill by weekStartDate.
      this.router.navigate(['/timesheet/create'], { queryParams: { weekStartDate: r.weekStartDate } });
      return;
    }
    // Submitted/Approved/Rejected: go to details view.
    this.router.navigate(['/timesheet/view', r.id]);
  }
}

