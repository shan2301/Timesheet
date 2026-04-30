import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Team Timesheets</h2>
          <p class="subtitle">
            Managers see entries for users in their departments, on projects in those departments.
          </p>
        </div>
        <div class="actions" style="justify-content: flex-end;">
          <button class="btn btn-link" routerLink="/dashboard">Back</button>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>
      </div>
      <div class="card-body stack">
        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>

        <div class="subtitle" *ngIf="!error()">{{ rows().length }} timesheet(s)</div>

        <table class="table" *ngIf="rows().length; else empty">
          <thead>
            <tr>
              <th>User</th>
              <th>Project</th>
              <th>Date</th>
              <th>Hours</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of rows()">
              <td>{{ t.userLabel }}</td>
              <td>{{ t.projectLabel }}</td>
              <td>{{ t.date | date: 'yyyy-MM-dd' }}</td>
              <td>{{ t.hoursWorked }}</td>
              <td>{{ t.description || '—' }}</td>
              <td>
                <span
                  class="pill"
                  [class.pending]="t.status === 'Pending'"
                  [class.approved]="t.status === 'Approved'"
                  [class.rejected]="t.status === 'Rejected'"
                >
                  {{ t.status || 'Pending' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <ng-template #empty>
          <div class="subtitle" *ngIf="!busy() && !error()">No timesheets in scope.</div>
        </ng-template>
      </div>
    </div>
  `,
})
export class TeamComponent implements OnInit {
  readonly rows = signal<
    {
      userLabel: string;
      projectLabel: string;
      date: string;
      hoursWorked: number;
      description: string | null;
      status: string;
    }[]
  >([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private ts: TimesheetService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.ts.getManagerTimesheets().subscribe({
      next: (res) => {
        const raw = Array.isArray(res) ? res : [];
        const mapped = raw.map((x: any) => ({
          userLabel: this.userLabel(x),
          projectLabel: this.projectLabel(x),
          date: String(x.date ?? x.Date ?? ''),
          hoursWorked: Number(x.hoursWorked ?? x.HoursWorked ?? 0),
          description: (x.description ?? x.Description) as string | null,
          status: String(x.status ?? x.Status ?? 'Pending'),
        }));
        this.rows.set(mapped);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load team timesheets.');
      },
      complete: () => this.busy.set(false),
    });
  }

  private userLabel(row: any): string {
    const name = row.userName ?? row.UserName;
    if (name) return String(name);
    const id = row.userId ?? row.UserId;
    return id != null ? `User #${id}` : '—';
  }

  private projectLabel(row: any): string {
    const name = row.projectName ?? row.ProjectName;
    if (name) return String(name);
    const id = row.projectId ?? row.ProjectId;
    return id != null ? `#${id}` : '—';
  }
}

