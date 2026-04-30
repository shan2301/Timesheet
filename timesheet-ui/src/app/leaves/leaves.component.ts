import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LeaveService } from '../services/leave.service';

type LeaveRow = {
  id: number;
  startDate: string;
  endDate: string;
  type: string;
  units: number;
  reason: string;
  status: string;
  reviewerComment: string;
  createdAt: string;
  reviewedAt: string;
};

type LeaveBalanceRow = {
  type: string;
  maxUnitsPerYear: number | null;
  usedUnits: number;
  availableUnits: number | null;
  year: number;
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

function toIsoDate(value: string): string {
  return value ? new Date(value).toISOString() : '';
}

function normLeave(raw: any): LeaveRow {
  return {
    id: Number(raw.id ?? raw.Id),
    startDate: String(raw.startDate ?? raw.StartDate ?? ''),
    endDate: String(raw.endDate ?? raw.EndDate ?? ''),
    type: String(raw.type ?? raw.Type ?? 'CasualLeave'),
    units: Number(raw.units ?? raw.Units ?? 1),
    reason: String(raw.reason ?? raw.Reason ?? ''),
    status: String(raw.status ?? raw.Status ?? 'Pending'),
    reviewerComment: String(raw.reviewerComment ?? raw.ReviewerComment ?? ''),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    reviewedAt: String(raw.reviewedAt ?? raw.ReviewedAt ?? ''),
  };
}

const LEAVE_TYPES: { value: string; label: string; unitsHint: string }[] = [
  { value: 'CasualLeave', label: 'Casual Leave', unitsHint: 'Full day(s)' },
  { value: 'HalfCasualLeave', label: 'Half Casual Leave', unitsHint: 'Half day (same date)' },
  { value: 'MedicalLeave', label: 'Medical Leave', unitsHint: 'Full day(s)' },
  { value: 'HalfMedicalLeave', label: 'Half Medical Leave', unitsHint: 'Half day (same date)' },
  { value: 'UnpaidLeave', label: 'Unpaid Leave', unitsHint: 'Full day(s)' },
  { value: 'UnpaidHalfDayLeave', label: 'Unpaid Half Day Leave', unitsHint: 'Half day (same date)' },
];

function leaveLabel(type: string): string {
  const hit = LEAVE_TYPES.find((x) => x.value === type);
  return hit ? hit.label : type;
}

@Component({
  selector: 'app-leaves',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Leave Requests</h2>
          <p class="subtitle">Submit a leave request and track approvals.</p>
        </div>
      </div>

      <div class="card-body stack">
        <div *ngIf="balances().length" class="card" style="box-shadow: none; background: rgba(255, 255, 255, 0.55);">
          <div class="card-body">
            <div class="row" style="align-items: flex-end;">
              <div>
                <h3 class="title" style="font-size: 16px; margin: 0;">Leave balance ({{ balances()[0]?.year }})</h3>
                <div class="subtitle" style="margin-top: 6px;">Half-day leaves are counted in the same category.</div>
              </div>
            </div>

            <table class="table" style="margin-top: 10px;">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Max / year</th>
                  <th>Used</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let b of balances()">
                  <td>{{ leaveLabel(b.type) }}</td>
                  <td>{{ b.maxUnitsPerYear === null ? 'Unlimited' : b.maxUnitsPerYear }}</td>
                  <td>{{ b.usedUnits }}</td>
                  <td>{{ b.availableUnits === null ? '—' : b.availableUnits }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="box-shadow: none; background: rgba(255, 255, 255, 0.55);">
          <div class="card-body">
            <h3 class="title" style="font-size: 16px; margin-bottom: 10px;">New request</h3>

            <form class="stack" (ngSubmit)="submit()">
              <div class="row">
                <div class="field">
                  <label>Start date</label>
                  <input class="input" name="startDate" type="date" [(ngModel)]="form.startDate" required />
                </div>
                <div class="field">
                  <label>End date</label>
                  <input class="input" name="endDate" type="date" [(ngModel)]="form.endDate" required />
                </div>
                <div class="field">
                  <label>Type</label>
                  <select class="input" name="type" [(ngModel)]="form.type">
                    <option *ngFor="let t of leaveTypes" [value]="t.value">
                      {{ t.label }}
                    </option>
                  </select>
                  <div class="subtitle" style="margin-top: 6px;">
                    {{ leaveTypes.find(t => t.value === form.type)?.unitsHint }}
                  </div>
                </div>
              </div>

              <div class="field">
                <label>Reason</label>
                <textarea
                  class="input"
                  name="reason"
                  rows="3"
                  [(ngModel)]="form.reason"
                  placeholder="Optional"
                ></textarea>
              </div>

              <div *ngIf="formError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
                {{ formError() }}
              </div>
              <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
                {{ success() }}
              </div>

              <div class="actions" style="justify-content: flex-start;">
                <button class="btn btn-primary" type="submit" [disabled]="busy()">
                  {{ busy() ? 'Submitting…' : 'Submit request' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="actions" style="justify-content: space-between;">
          <div class="subtitle" style="margin:0;">{{ leaves().length }} requests</div>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>

        <div *ngIf="listError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ listError() }}
        </div>

        <table class="table" *ngIf="leaves().length; else empty">
          <thead>
            <tr>
              <th>Id</th>
              <th>Dates</th>
              <th>Type</th>
              <th>Units</th>
              <th>Status</th>
              <th>Reviewer comment</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let lr of leaves()">
              <td>{{ lr.id }}</td>
              <td>{{ lr.startDate | date : 'dd-MMM-yyyy' }} → {{ lr.endDate | date : 'dd-MMM-yyyy' }}</td>
              <td>{{ leaveLabel(lr.type) }}</td>
              <td>{{ lr.units }}</td>
              <td>
                <span class="pill" [class.pending]="lr.status === 'Pending'" [class.active]="lr.status === 'Approved'"
                  [class.inactive]="lr.status === 'Rejected'">
                  {{ lr.status }}
                </span>
              </td>
              <td style="max-width: 360px;">{{ lr.reviewerComment || '—' }}</td>
              <td>{{ lr.createdAt | date : 'dd-MMM-yyyy, h:mm a' }}</td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <div class="subtitle">No leave requests yet.</div>
        </ng-template>
      </div>
    </div>
  `,
})
export class LeavesComponent implements OnInit {
  readonly leaves = signal<LeaveRow[]>([]);
  readonly balances = signal<LeaveBalanceRow[]>([]);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly leaveTypes = LEAVE_TYPES;
  readonly leaveLabel = leaveLabel;

  form: { startDate: string; endDate: string; type: string; reason: string } = {
    startDate: '',
    endDate: '',
    type: 'CasualLeave',
    reason: '',
  };

  constructor(private leave: LeaveService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.listError.set(null);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.busy.set(false);
    };

    this.leave.myLeaves().subscribe({
      next: (res) => this.leaves.set(parseList(res).map(normLeave)),
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to load leave requests.');
        this.leaves.set([]);
      },
      complete: done,
    });

    this.leave.balance().subscribe({
      next: (res: any) => this.balances.set(parseList(res) as LeaveBalanceRow[]),
      error: () => this.balances.set([]),
      complete: done,
    });
  }

  submit() {
    const start = this.form.startDate;
    const end = this.form.endDate;
    if (!start || !end) {
      this.formError.set('Start date and end date are required.');
      return;
    }

    const startD = new Date(start);
    const endD = new Date(end);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      this.formError.set('Invalid dates.');
      return;
    }
    if (endD < startD) {
      this.formError.set('End date must be on or after start date.');
      return;
    }

    const isHalfDay =
      this.form.type === 'HalfCasualLeave' ||
      this.form.type === 'HalfMedicalLeave' ||
      this.form.type === 'UnpaidHalfDayLeave';
    if (isHalfDay && start !== end) {
      this.formError.set('For half-day leave, start date and end date must be the same.');
      return;
    }

    this.formError.set(null);
    this.success.set(null);
    this.busy.set(true);

    this.leave
      .createLeave({
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        type: this.form.type,
        reason: this.form.reason?.trim() || null,
      })
      .subscribe({
        next: () => {
          this.form.reason = '';
          this.success.set('Leave request submitted.');
          this.load();
        },
        error: (err) => {
          this.formError.set(err?.error?.message || 'Failed to submit leave request.');
          this.busy.set(false);
        },
      });
  }
}

