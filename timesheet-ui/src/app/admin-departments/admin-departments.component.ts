import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MasterDataService } from '../services/master-data.service';

export type DepartmentRow = { id: number; name: string };

function normDept(raw: any): DepartmentRow {
  return {
    id: Number(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
  };
}

function parseList(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
  }
  return [];
}

@Component({
  selector: 'app-admin-departments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Departments</h2>
          <p class="subtitle">Add departments and review the directory.</p>
        </div>
        <button class="btn btn-link" routerLink="/dashboard">Back</button>
      </div>
      <div class="card-body">
        <div class="stack">
          <div class="card" style="box-shadow: none; background: rgba(255, 255, 255, 0.55);">
            <div class="card-body">
              <h3 class="title" style="font-size: 16px; margin-bottom: 10px;">Add department</h3>
              <form class="stack" (ngSubmit)="addDepartment()">
                <div class="field">
                  <label>Name</label>
                  <input class="input" name="deptName" [(ngModel)]="newName" placeholder="e.g. IT" />
                </div>
                <div *ngIf="formError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
                  {{ formError() }}
                </div>
                <div class="actions" style="justify-content: flex-start;">
                  <button class="btn btn-primary" type="submit" [disabled]="busy()">Save</button>
                </div>
              </form>
            </div>
          </div>

          <div class="actions" style="justify-content: space-between;">
            <div class="subtitle" style="margin: 0;">{{ departments().length }} departments</div>
            <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
          </div>

          <div *ngIf="listError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ listError() }}
          </div>

          <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
            {{ success() }}
          </div>

          <table class="table" *ngIf="departments().length; else empty">
            <thead>
              <tr>
                <th>Id</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of departments()">
                <td>{{ d.id }}</td>
                <td>{{ d.name }}</td>
              </tr>
            </tbody>
          </table>
          <ng-template #empty>
            <div class="subtitle">No departments yet.</div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
})
export class AdminDepartmentsComponent implements OnInit {
  readonly departments = signal<DepartmentRow[]>([]);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  newName = '';

  constructor(private masterData: MasterDataService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.busy.set(true);
    this.listError.set(null);
    this.masterData.getDepartments().subscribe({
      next: (res) => {
        this.departments.set(parseList(res).map(normDept));
      },
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to load departments.');
      },
      complete: () => this.busy.set(false),
    });
  }

  addDepartment() {
    const name = this.newName.trim();
    if (!name) {
      this.formError.set('Name is required.');
      return;
    }
    this.formError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.masterData.createDepartment(name).subscribe({
      next: () => {
        this.newName = '';
        this.success.set('Department created.');
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Failed to create department.');
        this.busy.set(false);
      },
    });
  }
}
