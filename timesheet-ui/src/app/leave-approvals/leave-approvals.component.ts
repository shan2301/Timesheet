import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaveService } from '../services/leave.service';

type PendingLeaveRow = {
  id: number;
  userId: number;
  userName: string;
  email: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  createdAt: string;
  reviewedAt: string;
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

function normPending(raw: any): PendingLeaveRow {
  return {
    id: Number(raw.id ?? raw.Id),
    userId: Number(raw.userId ?? raw.UserId),
    userName: String(raw.userName ?? raw.UserName ?? ''),
    email: String(raw.email ?? raw.Email ?? ''),
    startDate: String(raw.startDate ?? raw.StartDate ?? ''),
    endDate: String(raw.endDate ?? raw.EndDate ?? ''),
    type: String(raw.type ?? raw.Type ?? 'Leave'),
    status: String(raw.status ?? raw.Status ?? 'Pending'),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    reviewedAt: String(raw.reviewedAt ?? raw.ReviewedAt ?? ''),
  };
}

@Component({
  selector: 'app-leave-approvals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Leave Approvals</h2>
          <p class="subtitle">Approve or reject leave requests.</p>
        </div>
      </div>

      <div class="card-body stack">
        <div class="actions" style="justify-content: space-between;">
          <div class="subtitle" style="margin:0;">{{ rows().length }} requests</div>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>

        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>

        <table class="table" *ngIf="rows().length; else empty">
          <thead>
            <tr>
              <th>User</th>
              <th>Date of leave</th>
              <th>Request created</th>
              <th>Reviewed</th>
              <th>Status</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows()">
              <td>
                <div style="font-weight: 700;">{{ r.userName }}</div>
                <div class="subtitle" style="margin: 4px 0 0 0;">{{ r.email }}</div>
              </td>
              <td>{{ r.startDate | date : 'dd-MMM-yyyy' }} → {{ r.endDate | date : 'dd-MMM-yyyy' }}</td>
              <td>{{ r.createdAt | date : 'dd-MMM-yyyy, h:mm a' }}</td>
              <td>{{ r.reviewedAt ? (r.reviewedAt | date : 'dd-MMM-yyyy, h:mm a') : '—' }}</td>
              <td>
                <span class="pill" [class.pending]="r.status === 'Pending'" [class.active]="r.status === 'Approved'" [class.inactive]="r.status === 'Rejected'">
                  {{ r.status }}
                </span>
              </td>
              <td>{{ r.type }}</td>
              <td>
                <div class="actions" style="justify-content: flex-start;">
                  <a class="btn btn-primary" [routerLink]="['/leave-approvals', r.id]">View</a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <div class="subtitle">No leave history found.</div>
        </ng-template>
      </div>
    </div>
  `,
})
export class LeaveApprovalsComponent implements OnInit {
  readonly rows = signal<PendingLeaveRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private leave: LeaveService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.leave.inboxLeaves().subscribe({
      next: (res) => this.rows.set(parseList(res).map(normPending)),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load leaves.');
        this.rows.set([]);
      },
      complete: () => this.busy.set(false),
    });
  }
}

