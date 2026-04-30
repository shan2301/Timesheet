import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-timesheets',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">All Timesheets</h2>
          <p class="subtitle">Admin-only.</p>
        </div>
        <button class="btn btn-link" routerLink="/dashboard">Back</button>
      </div>
      <div class="card-body">
        <div class="subtitle">UI coming next.</div>
      </div>
    </div>
  `,
})
export class AdminTimesheetsComponent {}

