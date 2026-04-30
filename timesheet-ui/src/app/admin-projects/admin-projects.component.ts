import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MasterDataService } from '../services/master-data.service';

export type DepartmentRow = { id: number; name: string };
export type ProjectRow = { id: number; name: string; departmentId: number; isActive: boolean };

function normDept(raw: any): DepartmentRow {
  return {
    id: Number(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
  };
}

function normProject(raw: any): ProjectRow {
  return {
    id: Number(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
    departmentId: Number(raw.departmentId ?? raw.DepartmentId ?? 0),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
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
  selector: 'app-admin-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Projects</h2>
          <p class="subtitle">Create projects and enable/disable them.</p>
        </div>
        <button class="btn btn-link" routerLink="/dashboard">Back</button>
      </div>
      <div class="card-body">
        <div class="stack">
          <div class="card" style="box-shadow: none; background: rgba(255, 255, 255, 0.55);">
            <div class="card-body">
              <h3 class="title" style="font-size: 16px; margin-bottom: 10px;">Add project</h3>
              <form class="stack" (ngSubmit)="addProject()">
                <div class="field">
                  <label>Department</label>
                  <select class="input" name="deptId" [(ngModel)]="selectedDepartmentId" required>
                    <option [ngValue]="null" disabled>Select department…</option>
                    <option *ngFor="let d of departments()" [ngValue]="d.id">{{ d.name }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Project name</label>
                  <input class="input" name="projName" [(ngModel)]="newProjectName" placeholder="e.g. Portal" />
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
            <div class="subtitle" style="margin: 0;">{{ projects().length }} projects</div>
            <button class="btn" type="button" (click)="loadAll()" [disabled]="busy()">Refresh</button>
          </div>

          <div *ngIf="listError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ listError() }}
          </div>
          <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
            {{ success() }}
          </div>

          <table class="table" *ngIf="projects().length; else empty">
            <thead>
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Department Id</th>
                <th>Status</th>
                <th style="width: 160px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of projects()">
                <td>{{ p.id }}</td>
                <td>{{ p.name }}</td>
                <td>{{ p.departmentId }}</td>
                <td>
                  <span class="pill" [class.active]="p.isActive" [class.inactive]="!p.isActive">
                    {{ p.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td>
                  <button class="btn" type="button" (click)="toggleProject(p)" [disabled]="busy()">
                    {{ p.isActive ? 'Deactivate' : 'Activate' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <ng-template #empty>
            <div class="subtitle">No projects yet.</div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
})
export class AdminProjectsComponent implements OnInit {
  readonly departments = signal<DepartmentRow[]>([]);
  readonly projects = signal<ProjectRow[]>([]);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  selectedDepartmentId: number | null = null;
  newProjectName = '';

  constructor(private masterData: MasterDataService) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.busy.set(true);
    this.listError.set(null);
    let pending = 2;
    const done = () => {
      pending--;
      if (pending === 0) this.busy.set(false);
    };

    this.masterData.getDepartments().subscribe({
      next: (res) => {
        this.departments.set(parseList(res).map(normDept));
      },
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to load departments.');
      },
      complete: done,
    });

    this.masterData.getProjects().subscribe({
      next: (res) => {
        this.projects.set(parseList(res).map(normProject));
      },
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to load projects.');
      },
      complete: done,
    });
  }

  addProject() {
    const name = this.newProjectName.trim();
    const deptId = this.selectedDepartmentId;
    if (!name) {
      this.formError.set('Project name is required.');
      return;
    }
    if (deptId == null || deptId <= 0) {
      this.formError.set('Select a department.');
      return;
    }
    this.formError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.masterData.createProject(name, deptId).subscribe({
      next: () => {
        this.newProjectName = '';
        this.success.set('Project created.');
        this.loadAll();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Failed to create project.');
        this.busy.set(false);
      },
    });
  }

  toggleProject(p: ProjectRow) {
    this.formError.set(null);
    this.listError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.masterData.toggleProject(p.id).subscribe({
      next: (res: any) => {
        const nextActive = Boolean(res?.isActive ?? res?.IsActive ?? !p.isActive);
        this.projects.update((list) =>
          list.map((x) => (x.id === p.id ? { ...x, isActive: nextActive } : x))
        );
        this.success.set(nextActive ? 'Project activated.' : 'Project deactivated.');
        this.busy.set(false);
      },
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to update project status.');
        this.busy.set(false);
      },
    });
  }
}
