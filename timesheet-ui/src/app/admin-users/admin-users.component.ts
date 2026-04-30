import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { UsersService } from '../services/users.service';
import { MasterDataService } from '../services/master-data.service';

/** Row shape used in the template (camelCase). */
export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  contactNumber?: string;
  role: string;
  designation?: string;
  managerId?: number | null;
  isActive: boolean;
  createdDate?: string;
};

function parseUsersResponse(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
    if (Array.isArray(o['users'])) return o['users'] as any[];
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  if (typeof res === 'string') {
    try {
      const parsed = JSON.parse(res) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeUser(raw: any): AdminUserRow {
  const id = raw.id ?? raw.Id;
  const role = String(raw.role ?? raw.Role ?? 'Employee');
  return {
    id: Number(id),
    name: String(raw.name ?? raw.Name ?? ''),
    email: String(raw.email ?? raw.Email ?? ''),
    contactNumber: raw.contactNumber ?? raw.ContactNumber ?? undefined,
    role,
    designation: raw.designation ?? raw.Designation ?? undefined,
    managerId: raw.managerId ?? raw.ManagerId ?? null,
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    createdDate: raw.createdDate ?? raw.CreatedDate,
  };
}

type DeptRow = { id: number; name: string };

function normDept(raw: any): DeptRow {
  return {
    id: Number(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
  };
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Manage Users</h2>
          <p class="subtitle">Browse users; open a user to edit role, status, or mappings.</p>
        </div>
        <div class="actions" style="justify-content: flex-end;">
          <button class="btn btn-link" routerLink="/dashboard">Back</button>
          <button class="btn btn-primary" type="button" (click)="openCreateSheet()">
            Create New User
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="stack">
          <div class="actions" style="justify-content: space-between;">
            <div class="subtitle" style="margin:0;">{{ users().length }} users</div>
            <button class="btn" type="button" (click)="loadUsers()" [disabled]="busy()">
              Refresh
            </button>
          </div>

          <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ error() }}
          </div>

          <table class="table" *ngIf="users().length; else empty">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th style="width: 100px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users()">
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td>
                  <span class="subtitle" style="margin: 0;">{{ u.role }}</span>
                </td>
                <td>
                  <span
                    class="pill"
                    [class.active]="u.isActive"
                    [class.inactive]="!u.isActive"
                  >
                    {{ u.isActive ? 'Active' : 'Disabled' }}
                  </span>
                </td>
                <td class="actions" style="justify-content:flex-start;">
                  <a class="btn btn-link" [routerLink]="['/admin/users', u.id]" style="padding-inline: 8px;">
                    View
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          <ng-template #empty>
            <div class="subtitle">No users found.</div>
          </ng-template>
        </div>
      </div>
    </div>

    <div class="sheet-backdrop" *ngIf="sheetOpen" (click)="closeCreateSheet()"></div>
    <aside class="sheet" *ngIf="sheetOpen" role="dialog" aria-modal="true">
      <div class="sheet-header">
        <div>
          <div class="title" style="font-size: 18px;">Create New User</div>
          <div class="subtitle" style="margin-top: 4px;">
            Fill in the details and save.
          </div>
        </div>
        <button class="btn btn-link" type="button" (click)="closeCreateSheet()">Close</button>
      </div>

      <div class="sheet-body">
        <form class="stack" (ngSubmit)="createUser()">
          <div class="row">
            <div class="field">
              <label>Name</label>
              <input class="input" name="createName" [(ngModel)]="createForm.name" required />
            </div>
            <div class="field">
              <label>Email</label>
              <input class="input" name="createEmail" [(ngModel)]="createForm.email" required />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label>Password</label>
              <input
                class="input"
                type="password"
                name="createPassword"
                [(ngModel)]="createForm.password"
                required
              />
            </div>
            <div class="field">
              <label>Contact number</label>
              <input
                class="input"
                name="createContact"
                [(ngModel)]="createForm.contactNumber"
                placeholder="e.g. +91 98765 43210"
              />
            </div>
          </div>

          <div class="field">
            <label>Role</label>
            <select class="input" name="createRole" [(ngModel)]="createForm.role" required (change)="onRoleChanged()">
              <option value="" disabled>Select role…</option>
              <option *ngFor="let r of createRoles" [value]="r">{{ r }}</option>
            </select>
          </div>

          <ng-container *ngIf="createForm.role">
            <div class="field" *ngIf="createForm.role !== 'Admin'">
              <label>Designation</label>
              <input
                class="input"
                name="createDesignation"
                [(ngModel)]="createForm.designation"
                placeholder="e.g. Software Engineer"
              />
            </div>

            <div class="field" *ngIf="createForm.role === 'Employee'">
              <label>Assigned manager</label>
              <select class="input" name="createManager" [(ngModel)]="createForm.managerId">
                <option [ngValue]="null">Select manager…</option>
                <option *ngFor="let m of managerOptions()" [ngValue]="m.id">
                  {{ m.name }} ({{ m.email }})
                </option>
              </select>
              <p class="subtitle" style="margin-top: 6px;" *ngIf="!managerOptions().length">
                No managers found yet. Create a Manager user first.
              </p>
            </div>

            <div class="field" *ngIf="createForm.role !== 'Admin'">
              <label>Departments (mapping)</label>
              <p class="subtitle" style="margin-top: 4px;">
                Select one or more departments to map this user to.
              </p>
              <div class="stack" style="gap: 8px; max-height: 180px; overflow: auto; padding: 10px; border: 1px solid rgba(148,163,184,0.35); border-radius: 10px;">
                <label class="subtitle" style="display:flex; gap: 10px; align-items:center; margin: 0;" *ngFor="let d of departments()">
                  <input type="checkbox" [checked]="selectedDeptIds().has(d.id)" (change)="toggleDept(d.id, $event)" />
                  <span>{{ d.name }}</span>
                </label>
                <div class="subtitle" *ngIf="!departments().length">No departments available.</div>
              </div>
            </div>
          </ng-container>

          <div *ngIf="sheetError" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ sheetError }}
          </div>

          <div class="actions">
            <button class="btn" type="button" (click)="resetCreateForm()">Clear</button>
            <button class="btn btn-primary" type="submit" [disabled]="busy()">
              {{ busy() ? 'Saving…' : 'Create User' }}
            </button>
          </div>
        </form>
      </div>
    </aside>
  `,
})
export class AdminUsersComponent implements OnInit {
  readonly users = signal<AdminUserRow[]>([]);
  readonly createRoles = ['Employee', 'Manager', 'Admin'];
  readonly departments = signal<DeptRow[]>([]);
  readonly selectedDeptIds = signal<Set<number>>(new Set());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  sheetOpen = false;
  sheetError: string | null = null;

  createForm: any = {
    name: '',
    email: '',
    password: '',
    role: '' as '' | 'Employee' | 'Manager' | 'Admin',
    designation: '',
    managerId: null as number | null,
    contactNumber: '',
  };

  constructor(
    private usersService: UsersService,
    private masterData: MasterDataService
  ) {}

  ngOnInit() {
    this.loadUsers();
    this.loadDepartments();
  }

  openCreateSheet() {
    this.sheetError = null;
    this.resetCreateForm();
    this.sheetOpen = true;
  }

  closeCreateSheet() {
    this.sheetOpen = false;
    this.sheetError = null;
  }

  resetCreateForm() {
    this.createForm = {
      name: '',
      email: '',
      password: '',
      role: '' as '' | 'Employee' | 'Manager' | 'Admin',
      designation: '',
      managerId: null as number | null,
      contactNumber: '',
    };
    this.selectedDeptIds.set(new Set());
    this.sheetError = null;
  }

  managerOptions(): AdminUserRow[] {
    return this.users().filter((u) => u.role === 'Manager' && u.isActive);
  }

  loadDepartments() {
    this.masterData.getDepartments().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.$values ?? []);
        this.departments.set(Array.isArray(list) ? list.map(normDept) : []);
      },
      error: () => {
        this.departments.set([]);
      },
    });
  }

  onRoleChanged() {
    // Clear manager selection when not an employee.
    if (this.createForm.role !== 'Employee') {
      this.createForm.managerId = null;
    }
    if (this.createForm.role === 'Admin') {
      this.createForm.designation = '';
      this.selectedDeptIds.set(new Set());
    }
  }

  toggleDept(deptId: number, ev: Event) {
    const checked = (ev.target as HTMLInputElement | null)?.checked ?? false;
    const next = new Set(this.selectedDeptIds());
    if (checked) next.add(deptId);
    else next.delete(deptId);
    this.selectedDeptIds.set(next);
  }

  loadUsers() {
    this.busy.set(true);
    this.error.set(null);

    this.usersService.getUsers().subscribe({
      next: (res: any) => {
        const list = parseUsersResponse(res).map(normalizeUser);
        this.users.set(list);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load users.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  createUser() {
    this.busy.set(true);
    this.sheetError = null;

    if (!this.createForm.role) {
      this.sheetError = 'Select a role.';
      this.busy.set(false);
      return;
    }

    const deptIds = this.createForm.role === 'Admin' ? [] : Array.from(this.selectedDeptIds());
    const deptNames = this.departments()
      .filter((d) => deptIds.includes(d.id))
      .map((d) => d.name);

    const dto = {
      name: this.createForm.name,
      email: this.createForm.email,
      password: this.createForm.password,
      role: this.createForm.role,
      contactNumber: this.createForm.contactNumber,
      designation: this.createForm.role === 'Admin' ? null : this.createForm.designation,
      managerId: this.createForm.role === 'Employee' ? this.createForm.managerId : null,
    };

    this.usersService
      .createUser(dto)
      .pipe(
        switchMap(() => this.usersService.getUsers()),
        switchMap((res: any) => {
          const created = parseUsersResponse(res)
            .map(normalizeUser)
            .find((u) => String(u.email).toLowerCase() === String(dto.email).toLowerCase());
          if (!created || deptIds.length === 0) return of(null);
          return forkJoin(deptIds.map((id) => this.masterData.assignUserDepartment(created.id, id)));
        })
      )
      .subscribe({
        next: () => {
          this.resetCreateForm();
          this.closeCreateSheet();
          this.loadUsers();
        },
        error: (err) => {
          this.sheetError = err?.error?.message || 'Failed to create user.';
          this.busy.set(false);
        },
      });
  }

}

