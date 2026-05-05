import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimesheetService } from '../services/timesheet.service';

@Component({
  selector: 'app-admin-timesheets',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">All Timesheets</h2>
          <p class="subtitle">Admin-only. Export legacy daily timesheet rows to Excel.</p>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="button" (click)="exportExcel()" [disabled]="exportBusy()">
            {{ exportBusy() ? 'Exporting…' : 'Export Excel' }}
          </button>
          <button class="btn btn-link" routerLink="/dashboard">Back</button>
        </div>
      </div>
      <div class="card-body">
        <div class="subtitle" *ngIf="error()" style="color: rgba(171, 24, 16, 0.95);">{{ error() }}</div>
        <div class="subtitle" *ngIf="!error()">Use Export Excel to download all daily timesheet entries.</div>
      </div>
    </div>
  `,
})
export class AdminTimesheetsComponent {
  readonly exportBusy = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private ts: TimesheetService) {}

  exportExcel() {
    this.error.set(null);
    this.exportBusy.set(true);
    this.ts.exportTimesheetsExcel().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Timesheets-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportBusy.set(false);
      },
      error: () => {
        this.error.set('Could not export Excel.');
        this.exportBusy.set(false);
      },
    });
  }
}

