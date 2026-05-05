import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { NotificationsService, NotificationRow } from './services/notifications.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('timesheet-ui');

  // These must be signals (not computed) so they update after login/logout.
  readonly role = signal<string | null>(null);
  readonly isLoggedIn = signal(false);

  readonly notifCount = signal(0);
  readonly notifItems = signal<NotificationRow[]>([]);

  private sub?: Subscription;
  private onStorage?: (e: StorageEvent) => void;

  hasRole = (expected: 'Admin' | 'Manager' | 'Employee') => {
    const r: any = this.role();
    if (!r) return false;
    if (Array.isArray(r)) return r.map(String).some((x) => x.trim() === expected);
    const s = String(r);
    // Support comma-separated roles, or single role.
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .includes(expected);
  };

  isAdmin = computed(() => this.hasRole('Admin'));
  isManager = computed(() => this.hasRole('Manager'));
  isEmployee = computed(() => this.hasRole('Employee'));

  /** Single normalized role for UI conditions + pill display. */
  normalizedRole = computed<'Admin' | 'Manager' | 'Employee' | null>(() => {
    if (this.isAdmin()) return 'Admin';
    if (this.isManager()) return 'Manager';
    if (this.isEmployee()) return 'Employee';
    return null;
  });

  constructor(
    private auth: AuthService,
    private router: Router,
    private notifications: NotificationsService
  ) {}

  ngOnInit() {
    const refresh = () => {
      this.role.set(this.auth.getUserRole());
      this.isLoggedIn.set(!!this.auth.getToken());
    };

    refresh();

    this.sub = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        refresh();
        this.refreshNotifications();
      }
    });

    this.onStorage = (e: StorageEvent) => {
      if (e.key === 'token') {
        refresh();
        this.refreshNotifications();
      }
    };
    window.addEventListener('storage', this.onStorage);

    this.refreshNotifications();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.onStorage) window.removeEventListener('storage', this.onStorage);
  }

  logout() {
    this.auth.logout();
    this.role.set(null);
    this.isLoggedIn.set(false);
    this.notifCount.set(0);
    this.notifItems.set([]);
    this.router.navigateByUrl('/login');
  }

  refreshNotifications() {
    if (!this.isLoggedIn()) {
      this.notifCount.set(0);
      this.notifItems.set([]);
      return;
    }

    this.notifications.unreadCount().subscribe({
      next: (r) => this.notifCount.set(r.count || 0),
      error: () => this.notifCount.set(0)
    });

    this.notifications.my(10).subscribe({
      next: (rows) => this.notifItems.set(rows || []),
      error: () => this.notifItems.set([])
    });
  }

  markNotifRead(id: number) {
    this.notifications.markRead(id).subscribe({
      next: () => this.refreshNotifications(),
      error: () => this.refreshNotifications()
    });
  }

  markAllNotifsRead() {
    this.notifications.markAllRead().subscribe({
      next: () => this.refreshNotifications(),
      error: () => this.refreshNotifications()
    });
  }
}
