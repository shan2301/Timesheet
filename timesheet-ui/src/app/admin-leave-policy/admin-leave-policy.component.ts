import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MasterDataService } from '../services/master-data.service';

type PolicyRow = { id: number; type: string; maxUnitsPerYear: number | null };

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: 'CasualLeave', label: 'Casual Leave' },
  { value: 'MedicalLeave', label: 'Medical Leave' },
  { value: 'UnpaidLeave', label: 'Unpaid Leave' },
];

function parseList(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  return [];
}

function normPolicy(raw: any): PolicyRow {
  return {
    id: Number(raw.id ?? raw.Id ?? 0),
    type: String(raw.type ?? raw.Type ?? ''),
    maxUnitsPerYear:
      raw.maxUnitsPerYear === null || raw.MaxUnitsPerYear === null
        ? null
        : Number(raw.maxUnitsPerYear ?? raw.MaxUnitsPerYear ?? 0),
  };
}

function labelFor(type: string): string {
  const hit = LEAVE_TYPES.find((x) => x.value === type);
  return hit ? hit.label : type;
}

@Component({
  selector: 'app-admin-leave-policy',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Leave Policy</h2>
          <p class="subtitle">Set max leaves per type (per year). Leave blank for unlimited.</p>
        </div>
        <button class="btn btn-link" routerLink="/dashboard">Back</button>
      </div>

      <div class="card-body stack">
        <div class="actions" style="justify-content: space-between;">
          <div class="subtitle" style="margin:0;">{{ rows().length }} leave categories</div>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>

        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>

        <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
          {{ success() }}
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Leave type</th>
              <th style="width: 220px;">Max / year</th>
              <th style="width: 140px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows()">
              <td>{{ labelFor(r.type) }}</td>
              <td>
                <input
                  class="input"
                  type="number"
                  min="0"
                  step="0.5"
                  [name]="'max-' + r.type"
                  [(ngModel)]="r.maxUnitsPerYear"
                  placeholder="Unlimited"
                />
              </td>
              <td>
                <button class="btn btn-primary" type="button" (click)="save(r)" [disabled]="busy()">
                  Save
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminLeavePolicyComponent implements OnInit {
  readonly rows = signal<PolicyRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly labelFor = labelFor;

  constructor(private master: MasterDataService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.master.getLeavePolicies().subscribe({
      next: (res) => {
        const existing = parseList(res).map(normPolicy);
        const byType = new Map(existing.map((x) => [x.type, x]));
        const merged: PolicyRow[] = LEAVE_TYPES.map((t) => {
          const hit = byType.get(t.value);
          return hit ? hit : { id: 0, type: t.value, maxUnitsPerYear: null };
        });
        this.rows.set(merged);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load leave policies.');
        this.rows.set(LEAVE_TYPES.map((t) => ({ id: 0, type: t.value, maxUnitsPerYear: null })));
      },
      complete: () => this.busy.set(false),
    });
  }

  save(r: PolicyRow) {
    const max =
      r.maxUnitsPerYear === null || r.maxUnitsPerYear === ('' as any) ? null : Number(r.maxUnitsPerYear);
    if (max !== null && (Number.isNaN(max) || max < 0)) {
      this.error.set('Max must be a number >= 0 or blank for unlimited.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.master.upsertLeavePolicy({ type: r.type, maxUnitsPerYear: max }).subscribe({
      next: () => {
        this.success.set('Saved.');
        this.load();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to save.');
        this.busy.set(false);
      },
    });
  }
}

