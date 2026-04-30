import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { NotificationsService, NotificationRow } from '../services/notifications.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stack" style="gap: 10px;">
      <div class="navcrumb">
        <span>Dashboard</span>
        <span class="navcrumb-sep">›</span>
        <span>Notifications</span>
      </div>

      <div class="card card-soft">
        <div class="card-header">
          <div>
            <div class="h2">Notifications</div>
            <div class="muted">{{ unreadCount() }} unread</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button class="btn btn-link" type="button" (click)="reload()" [disabled]="busy()">
              Refresh
            </button>
            <button
              class="btn btn-primary"
              type="button"
              (click)="markAllRead()"
              [disabled]="busy() || unreadCount() === 0"
            >
              Mark all read
            </button>
          </div>
        </div>

        <div class="card-body">
          <div *ngIf="busy()" class="muted">Loading…</div>

          <div *ngIf="!busy() && rows().length === 0" class="muted">
            No notifications yet.
          </div>

          <div class="stack" style="gap:10px;" *ngIf="rows().length > 0">
            <button
              class="card card-soft notif-row"
              type="button"
              *ngFor="let n of rows()"
              (click)="markRead(n)"
              [class.unread]="!n.isRead"
            >
              <div class="notif-msg">{{ n.message }}</div>
              <div class="muted">{{ n.createdDate | date: 'medium' }}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class NotificationsComponent implements OnInit {
  readonly busy = signal(false);
  readonly rows = signal<NotificationRow[]>([]);

  readonly unreadCount = computed(() => this.rows().filter((x) => !x.isRead).length);

  constructor(private notifications: NotificationsService) {}

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.busy.set(true);
    this.notifications.my(200).subscribe({
      next: (rows) => {
        this.rows.set(rows || []);
        this.busy.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.busy.set(false);
      }
    });
  }

  markRead(n: NotificationRow) {
    if (n.isRead) return;
    this.notifications.markRead(n.id).subscribe({
      next: () => this.reload(),
      error: () => this.reload()
    });
  }

  markAllRead() {
    this.notifications.markAllRead().subscribe({
      next: () => this.reload(),
      error: () => this.reload()
    });
  }
}

