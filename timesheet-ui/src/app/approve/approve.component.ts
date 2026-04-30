import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

type ApprovalRow = {
  id: number;
  userId: number;
  userName: string;
  weekStartDate: string;
  weekEndDate: string;
  entryCount: number;
  totalHours: number;
  submittedAt: string;
  status: string;
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

function normRow(raw: any): ApprovalRow {
  return {
    id: Number(raw.id ?? raw.Id),
    userId: Number(raw.userId ?? raw.UserId),
    userName: String(raw.userName ?? raw.UserName ?? ''),
    weekStartDate: String(raw.weekStartDate ?? raw.WeekStartDate ?? ''),
    weekEndDate: String(raw.weekEndDate ?? raw.WeekEndDate ?? ''),
    entryCount: Number(raw.entryCount ?? raw.EntryCount ?? 0),
    totalHours: Number(raw.totalHours ?? raw.TotalHours ?? 0),
    submittedAt: String(raw.submittedAt ?? raw.SubmittedAt ?? ''),
    status: String(raw.status ?? raw.Status ?? 'Submitted'),
  };
}

@Component({
  selector: 'app-approve',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Approvals</h2>
          <p class="subtitle">Approve or reject timesheets from your team.</p>
        </div>
      </div>

      <div class="card-body stack">
        <div class="actions" style="justify-content: space-between;">
          <div class="subtitle" style="margin:0;">{{ rows().length }} timesheets</div>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>

        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>

        <table class="table" *ngIf="rows().length; else empty">
          <thead>
            <tr>
              <th>User</th>
              <th>Week</th>
              <th>Entries</th>
              <th>Total hours</th>
              <th>Submitted</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of rows()">
              <td>
                <div style="font-weight: 700;">{{ t.userName || t.userId }}</div>
                <div class="subtitle" style="margin: 4px 0 0 0;">#{{ t.userId }}</div>
              </td>
              <td>{{ t.weekStartDate | date : 'dd-MMM-yyyy' }} → {{ t.weekEndDate | date : 'dd-MMM-yyyy' }}</td>
              <td>{{ t.entryCount }}</td>
              <td>{{ t.totalHours }}</td>
              <td>{{ t.submittedAt | date : 'dd-MMM-yyyy, h:mm a' }}</td>
              <td>
                <span
                  class="pill"
                  [class.pending]="t.status === 'Submitted'"
                  [class.active]="t.status === 'Approved'"
                  [class.inactive]="t.status === 'Rejected'"
                >
                  {{ t.status }}
                </span>
              </td>
              <td>
                <div class="actions" style="justify-content: flex-start;">
                  <button class="btn" type="button" [routerLink]="'/approve/' + t.id">View</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <div class="subtitle">No timesheet history found.</div>
        </ng-template>
      </div>
    </div>
  `,
})
export class ApproveComponent implements OnInit {
  readonly rows = signal<ApprovalRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private ts: TimesheetService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.ts.getManagerWeeklyTimesheets().subscribe({
      next: (res) => this.rows.set(parseList(res).map(normRow)),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load timesheets.');
        this.rows.set([]);
      },
      complete: () => this.busy.set(false),
    });
  }

  approve(id: number) {
    this.busy.set(true);
    this.ts.approveWeeklyTimesheet(id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to approve.');
        this.busy.set(false);
      },
    });
  }

  reject(id: number) {
    this.busy.set(true);
    this.ts.rejectWeeklyTimesheet(id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to reject.');
        this.busy.set(false);
      },
    });
  }
}

