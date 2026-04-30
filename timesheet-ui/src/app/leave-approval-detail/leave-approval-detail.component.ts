import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LeaveService } from '../services/leave.service';

type LeaveDetail = {
  id: number;
  userId: number;
  userName: string;
  email: string;
  startDate: string;
  endDate: string;
  type: string;
  reason: string;
  status: string;
  createdAt: string;
  reviewedAt: string;
  reviewedById: number | null;
  reviewedByName: string;
  reviewerComment: string;
  rejectionReason: string;
};

function normDetail(raw: any): LeaveDetail {
  return {
    id: Number(raw.id ?? raw.Id),
    userId: Number(raw.userId ?? raw.UserId),
    userName: String(raw.userName ?? raw.UserName ?? ''),
    email: String(raw.email ?? raw.Email ?? ''),
    startDate: String(raw.startDate ?? raw.StartDate ?? ''),
    endDate: String(raw.endDate ?? raw.EndDate ?? ''),
    type: String(raw.type ?? raw.Type ?? 'Leave'),
    reason: String(raw.reason ?? raw.Reason ?? ''),
    status: String(raw.status ?? raw.Status ?? 'Pending'),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    reviewedAt: String(raw.reviewedAt ?? raw.ReviewedAt ?? ''),
    reviewedById: raw.reviewedById ?? raw.ReviewedById ?? null,
    reviewedByName: String(raw.reviewedByName ?? raw.ReviewedByName ?? ''),
    reviewerComment: String(raw.reviewerComment ?? raw.ReviewerComment ?? ''),
    rejectionReason: String(raw.rejectionReason ?? raw.RejectionReason ?? ''),
  };
}

@Component({
  selector: 'app-leave-approval-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="stack" style="gap: 10px;">
      <div class="subtitle" style="margin: 0;">
        <a class="navcrumb" routerLink="/dashboard">Dashboard</a>
        <span class="navcrumb-sep">›</span>
        <a class="navcrumb" routerLink="/leave-approvals">Leave Approvals</a>
        <span class="navcrumb-sep">›</span>
        <span style="font-weight: 800; color: rgba(0,0,0,0.80);">
          Request #{{ id() }}
        </span>
      </div>

      <div class="card">
        <div class="header">
          <div>
            <h2 class="title">Leave request</h2>
            <p class="subtitle">Review details and approve/reject.</p>
          </div>
        </div>

        <div class="card-body stack">
          <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ error() }}
          </div>

          <div *ngIf="loading()" class="subtitle">Loading…</div>

          <ng-container *ngIf="detail() as d">
            <div class="row" style="align-items: flex-start;">
              <div class="card" style="flex:1; box-shadow:none; background: rgba(255,255,255,0.55);">
                <div class="card-body stack">
                  <div class="row" style="justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-weight: 800; font-size: 16px;">{{ d.userName }}</div>
                      <div class="subtitle" style="margin: 6px 0 0 0;">{{ d.email }}</div>
                    </div>
                    <span
                      class="pill"
                      [class.pending]="d.status === 'Pending'"
                      [class.active]="d.status === 'Approved'"
                      [class.inactive]="d.status === 'Rejected'"
                    >
                      {{ d.status }}
                    </span>
                  </div>

                  <div class="row">
                    <div class="field" style="flex:1;">
                      <label>Date of leave</label>
                      <div class="input" style="display:flex; align-items:center;">
                        {{ d.startDate | date : 'dd-MMM-yyyy' }} → {{ d.endDate | date : 'dd-MMM-yyyy' }}
                      </div>
                    </div>
                    <div class="field" style="flex:1;">
                      <label>Request created</label>
                      <div class="input" style="display:flex; align-items:center;">
                        {{ d.createdAt | date : 'dd-MMM-yyyy, h:mm a' }}
                      </div>
                    </div>
                  </div>

                  <div class="row">
                    <div class="field" style="flex:1;">
                      <label>Type</label>
                      <div class="input" style="display:flex; align-items:center;">{{ d.type }}</div>
                    </div>
                  </div>

                  <div class="field">
                    <label>User comment</label>
                    <div class="input" style="min-height: 64px; white-space: pre-wrap;">{{ d.reason || '—' }}</div>
                  </div>

                  <div class="field" *ngIf="d.reviewerComment">
                    <label>Reviewer comment</label>
                    <div class="input" style="min-height: 56px; white-space: pre-wrap;">{{ d.reviewerComment }}</div>
                  </div>

                  <div class="field" *ngIf="d.rejectionReason">
                    <label>Rejection reason</label>
                    <div class="input" style="min-height: 56px; white-space: pre-wrap;">{{ d.rejectionReason }}</div>
                  </div>
                </div>
              </div>

              <div class="card" style="width: min(420px, 100%); box-shadow:none; background: rgba(255,255,255,0.55);">
                <div class="card-body stack">
                  <h3 class="title" style="font-size: 16px; margin-bottom: 4px;">Decision</h3>
                  <div class="subtitle" style="margin-top:0;">
                    Approve can have an optional comment. Reject requires a rejection reason.
                  </div>

                  <div class="field">
                    <label>Approve comment (optional)</label>
                    <textarea class="input" name="approveComment" rows="3" [(ngModel)]="approveComment"></textarea>
                  </div>

                  <div class="field">
                    <label>Rejection reason (required for reject)</label>
                    <textarea
                      class="input"
                      name="rejectionReason"
                      rows="3"
                      [(ngModel)]="rejectionReason"
                      placeholder="Why is this rejected?"
                    ></textarea>
                  </div>

                  <div *ngIf="actionError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
                    {{ actionError() }}
                  </div>
                  <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
                    {{ success() }}
                  </div>

                  <div *ngIf="d.status === 'Pending'; else reviewed" class="actions" style="justify-content: flex-start;">
                    <button class="btn btn-primary" type="button" (click)="approve()" [disabled]="busy()">
                      {{ busy() ? 'Saving…' : 'Approve' }}
                    </button>
                    <button class="btn btn-danger" type="button" (click)="reject()" [disabled]="busy()">
                      {{ busy() ? 'Saving…' : 'Reject' }}
                    </button>
                  </div>
                  <ng-template #reviewed>
                    <div class="subtitle" style="margin-top: 10px;">
                      This request has already been {{ d.status.toLowerCase() }}.
                    </div>
                  </ng-template>
                </div>
              </div>
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
})
export class LeaveApprovalDetailComponent implements OnInit {
  readonly id = signal<number>(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly detail = signal<LeaveDetail | null>(null);

  approveComment = '';
  rejectionReason = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private leave: LeaveService
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.id.set(id);
    if (!id) {
      this.error.set('Invalid request id.');
      this.loading.set(false);
      return;
    }
    this.load();
  }

  load() {
    const id = this.id();
    this.loading.set(true);
    this.error.set(null);
    this.leave.get(id).subscribe({
      next: (res) => this.detail.set(normDetail(res)),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load leave request.');
        this.detail.set(null);
      },
      complete: () => this.loading.set(false),
    });
  }

  approve() {
    const d = this.detail();
    if (!d) return;
    this.actionError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.leave.approve(d.id, this.approveComment?.trim() || null).subscribe({
      next: () => {
        this.success.set('Approved.');
        this.load();
      },
      error: (err) => {
        this.actionError.set(err?.error?.message || 'Failed to approve.');
        this.busy.set(false);
      },
    });
  }

  reject() {
    const d = this.detail();
    if (!d) return;
    const reason = this.rejectionReason.trim();
    if (!reason) {
      this.actionError.set('Rejection reason is required.');
      return;
    }
    this.actionError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.leave.reject(d.id, reason, this.approveComment?.trim() || null).subscribe({
      next: () => {
        this.success.set('Rejected.');
        this.router.navigate(['/leave-approvals']);
      },
      error: (err) => {
        this.actionError.set(err?.error?.message || 'Failed to reject.');
        this.busy.set(false);
      },
    });
  }
}

