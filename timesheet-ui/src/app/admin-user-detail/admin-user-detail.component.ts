import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, switchMap, throwError, of, forkJoin } from 'rxjs';
import { MasterDataService } from '../services/master-data.service';
import { UsersService } from '../services/users.service';

type IdName = { id: number; name: string };
type ProjectRow = { id: number; name: string; departmentId: number; isActive: boolean };
type EmployeeRow = {
  id: number;
  name: string;
  email: string;
  contactNumber: string;
  designation: string;
  isActive: boolean;
};

type LeaveBalanceRow = {
  type: string;
  year: number;
  maxUnitsPerYear: number | null;
  usedUnits: number;
  availableUnits: number | null;
};

export type UserDetailView = {
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  designation?: string;
  managerId?: number | null;
  contactNumber?: string;
};

function normDeptList(raw: unknown): IdName[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({
    id: Number(x.id ?? x.Id),
    name: String(x.name ?? x.Name ?? ''),
  }));
}

function normProjList(raw: unknown): ProjectRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({
    id: Number(x.id ?? x.Id),
    name: String(x.name ?? x.Name ?? ''),
    departmentId: Number(x.departmentId ?? x.DepartmentId ?? 0),
    isActive: Boolean(x.isActive ?? x.IsActive ?? true),
  }));
}

function httpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const e = err.error;
    if (e == null || e === '') {
      if (err.status === 404) {
        return 'Not found (404). If this endpoint was added recently, stop and restart the API (`dotnet run`) so the new routes are loaded.';
      }
      return err.message || `Request failed (${err.status}).`;
    }
    if (typeof e === 'string') return e;
    if (typeof e === 'object' && e !== null && 'message' in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === 'string') return m;
    }
  }
  return 'Failed to load user.';
}

function normEmployeeList(raw: unknown): EmployeeRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({
    id: Number(x.id ?? x.Id),
    name: String(x.name ?? x.Name ?? ''),
    email: String(x.email ?? x.Email ?? ''),
    contactNumber: String(x.contactNumber ?? x.ContactNumber ?? ''),
    designation: String(x.designation ?? x.Designation ?? ''),
    isActive: Boolean(x.isActive ?? x.IsActive ?? true),
  }));
}

function normLeaveBalances(raw: unknown): LeaveBalanceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({
    type: String(x.type ?? x.Type ?? ''),
    year: Number(x.year ?? x.Year ?? new Date().getFullYear()),
    maxUnitsPerYear:
      x.maxUnitsPerYear === null || x.MaxUnitsPerYear === null
        ? null
        : Number(x.maxUnitsPerYear ?? x.MaxUnitsPerYear ?? 0),
    usedUnits: Number(x.usedUnits ?? x.UsedUnits ?? 0),
    availableUnits:
      x.availableUnits === null || x.AvailableUnits === null
        ? null
        : Number(x.availableUnits ?? x.AvailableUnits ?? 0),
  }));
}

function leaveTypeLabel(type: string): string {
  switch (type) {
    case 'CasualLeave':
      return 'Casual Leave';
    case 'MedicalLeave':
      return 'Medical Leave';
    case 'UnpaidLeave':
      return 'Unpaid Leave';
    default:
      return type;
  }
}

@Component({
  selector: 'app-admin-user-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <nav class="subtitle" style="margin: 0 0 10px; display: flex; gap: 8px; align-items: center;" *ngIf="user() as u">
      <a class="btn btn-link" routerLink="/admin/users" style="padding: 0;">Users</a>
      <span style="opacity: 0.6;">/</span>
      <span>{{ u.name }}</span>
    </nav>

    <div class="card" *ngIf="!user() && error()">
      <div class="header">
        <h2 class="title">User</h2>
        <button class="btn btn-link" routerLink="/admin/users">Back to users</button>
      </div>
      <div class="card-body">
        <p class="subtitle" style="color: rgba(171, 24, 16, 0.95);">{{ error() }}</p>
      </div>
    </div>

    <div class="card" *ngIf="user() as u">
      <div class="header">
        <div>
          <h2 class="title">{{ editName || u.name }}</h2>
          <p class="subtitle">Profile, departments, and projects (map department first).</p>
        </div>
        <div class="actions" style="justify-content: flex-end;">
          <button class="btn btn-primary" type="button" (click)="saveUser()" [disabled]="busy()">Save</button>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>
      </div>
      <div class="card-body stack">
        <div class="row">
          <div class="field">
            <label>Name</label>
            <input class="input" name="name" [(ngModel)]="editName" />
          </div>
          <div class="field">
            <label>Email</label>
            <div class="subtitle" style="margin: 0;">{{ u.email }}</div>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Contact number</label>
            <input class="input" name="contactNumber" [(ngModel)]="editContactNumber" placeholder="e.g. +91 98765 43210" />
          </div>
          <div class="field">
            <label>Role</label>
            <select
              class="input"
              name="role"
              [(ngModel)]="editRole"
              (focus)="rememberRoleBefore()"
              (change)="changeRole()"
            >
              <option *ngFor="let r of roles" [value]="r">{{ r }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Designation</label>
            <ng-container *ngIf="u.role !== 'Admin'; else adminNoDesignation">
              <input class="input" name="designation" [(ngModel)]="editDesignation" placeholder="e.g. Software Engineer" />
            </ng-container>
            <ng-template #adminNoDesignation>
              <div class="subtitle" style="margin: 0;">—</div>
            </ng-template>
          </div>
          <div class="field" *ngIf="u.role === 'Employee'">
            <label>Assigned manager</label>
            <select class="input" name="managerId" [(ngModel)]="editManagerId">
              <option [ngValue]="null">Select manager…</option>
              <option *ngFor="let m of managers()" [ngValue]="m.id">
                {{ m.name }} ({{ m.email }})
              </option>
            </select>
          </div>
        </div>

        <div *ngIf="u.role === 'Manager'">
          <div class="divider"></div>
          <h3 class="title" style="font-size: 16px;">Assigned employees</h3>
          <p class="subtitle">Employees whose assigned manager is this user.</p>
          <table class="table" *ngIf="assignedEmployees().length; else noEmployees">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Contact</th>
                <th>Designation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of assignedEmployees()">
                <td>{{ e.name }}</td>
                <td>{{ e.email }}</td>
                <td>{{ e.contactNumber || '—' }}</td>
                <td>{{ e.designation || '—' }}</td>
                <td>
                  <span class="pill" [class.active]="e.isActive" [class.inactive]="!e.isActive">
                    {{ e.isActive ? 'Active' : 'Disabled' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <ng-template #noEmployees>
            <div class="subtitle">No employees assigned yet.</div>
          </ng-template>
        </div>
        <div class="row">
          <div class="field">
            <label>Status</label>
            <div class="row" style="align-items: center; gap: 12px; flex-wrap: wrap; margin: 0;">
              <span class="pill" [class.active]="u.isActive" [class.inactive]="!u.isActive">
                {{ u.isActive ? 'Active' : 'Disabled' }}
              </span>
              <button type="button" class="btn" (click)="toggleStatus()" [disabled]="busy()">
                {{ u.isActive ? 'Disable account' : 'Enable account' }}
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="u.role === 'Employee' && leaveBalances().length">
          <div class="divider"></div>
          <h3 class="title" style="font-size: 16px;">Leave balance ({{ leaveBalances()[0].year }})</h3>
          <p class="subtitle">Available leaves based on configured Leave Policy and this user’s requests.</p>

          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Max / year</th>
                <th>Used</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of leaveBalances()">
                <td>{{ leaveTypeLabel(b.type) }}</td>
                <td>{{ b.maxUnitsPerYear === null ? 'Unlimited' : b.maxUnitsPerYear }}</td>
                <td>{{ b.usedUnits }}</td>
                <td>{{ b.availableUnits === null ? 'Unlimited' : b.availableUnits }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="divider"></div>

        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>
        <div *ngIf="actionMessage()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
          {{ actionMessage() }}
        </div>
        <ng-container *ngIf="u.role !== 'Manager' && u.role !== 'Admin'">
          <p *ngIf="mappingDegraded()" class="subtitle" style="margin: 0; padding: 10px 12px; background: rgba(180, 120, 0, 0.12); border-radius: 8px;">
            Department and project mapping could not be loaded from this API build. Role and account status below still work. Restart the backend after <code>dotnet build</code> so the MasterData user-mapping route is registered, then use Refresh.
          </p>

          <ng-container *ngIf="!mappingDegraded(); else mappingSkipped">
          <h3 class="title" style="font-size: 16px;">Departments</h3>
          <p class="subtitle">
            Select one or more departments to map this user to. Removing a department will also remove any mapped projects in that department.
          </p>

          <div class="stack" style="gap: 8px; max-height: 220px; overflow: auto; padding: 10px; border: 1px solid rgba(148,163,184,0.35); border-radius: 10px;">
            <label class="subtitle" style="display:flex; gap: 10px; align-items:center; margin: 0;" *ngFor="let d of allDepartments()">
              <input type="checkbox" [checked]="selectedDeptIds().has(d.id)" (change)="toggleDeptSelection(d.id, $event)" />
              <span>{{ d.name }}</span>
            </label>
            <div class="subtitle" *ngIf="!allDepartments().length">No departments available.</div>
          </div>

          <div class="actions" style="justify-content: flex-start; margin-top: 10px;">
            <button class="btn btn-primary" type="button" (click)="saveDepartmentMapping()" [disabled]="busy()">
              Save departments
            </button>
          </div>

        <div class="divider"></div>

        <h3 class="title" style="font-size: 16px;">Mapped projects</h3>
        <p class="subtitle" *ngIf="user()?.role !== 'Manager' && !hasDepartments()">
          Map at least one department above to see projects you can assign.
        </p>
        <p class="subtitle" *ngIf="user()?.role !== 'Manager' && hasDepartments()">
          Only projects in this user’s mapped departments are listed.
        </p>

        <div class="row" style="align-items: flex-end;" *ngIf="canAssignProjects()">
          <div class="field" style="flex: 1;">
            <label>Add project</label>
            <select class="input" name="projAdd" [(ngModel)]="selectedProjectId">
              <option value="">Choose project…</option>
              <option *ngFor="let p of availableProjects()" [value]="p.id">
                {{ p.name }} (dept #{{ p.departmentId }}){{ p.isActive ? '' : ' — Inactive' }}
              </option>
            </select>
          </div>
          <button
            class="btn btn-primary"
            type="button"
            (click)="assignProject()"
            [disabled]="busy() || !selectedProjectId || !availableProjects().length"
          >
            Map project
          </button>
        </div>

        <table class="table" *ngIf="assignedProjects().length; else noProjs">
          <thead>
            <tr>
              <th>Id</th>
              <th>Name</th>
              <th>Department Id</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of assignedProjects()">
              <td>{{ p.id }}</td>
              <td>{{ p.name }}</td>
              <td>{{ p.departmentId }}</td>
            </tr>
          </tbody>
        </table>
        <ng-template #noProjs>
          <div class="subtitle">No projects mapped yet.</div>
        </ng-template>
          </ng-container>
          <ng-template #mappingSkipped></ng-template>
        </ng-container>
      </div>
    </div>
  `,
})
export class AdminUserDetailComponent implements OnInit {
  userId = 0;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionMessage = signal<string | null>(null);

  readonly user = signal<UserDetailView | null>(null);
  readonly assignedDepartments = signal<IdName[]>([]);
  readonly assignedProjects = signal<ProjectRow[]>([]);
  readonly availableProjects = signal<ProjectRow[]>([]);
  readonly mappingDegraded = signal(false);
  readonly assignedEmployees = signal<EmployeeRow[]>([]);
  readonly leaveBalances = signal<LeaveBalanceRow[]>([]);
  readonly allDepartments = signal<IdName[]>([]);
  readonly selectedDeptIds = signal<Set<number>>(new Set());

  selectedProjectId = '';

  readonly roles = ['Employee', 'Manager', 'Admin'];
  editRole = '';
  private roleBeforeEdit = '';
  editName = '';
  editContactNumber = '';
  editDesignation = '';
  editManagerId: number | null = null;
  readonly managers = signal<{ id: number; name: string; email: string }[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private master: MasterDataService,
    private usersService: UsersService
  ) {}

  readonly leaveTypeLabel = leaveTypeLabel;

  ngOnInit() {
    this.route.paramMap.subscribe((pm) => {
      const id = pm.get('id');
      this.userId = id ? parseInt(id, 10) : 0;
      if (!this.userId || Number.isNaN(this.userId)) {
        void this.router.navigate(['/admin/users']);
        return;
      }
      this.load();
    });
  }

  hasDepartments(): boolean {
    return this.assignedDepartments().length > 0;
  }

  canAssignProjects(): boolean {
    const u = this.user();
    if (!u) return false;
    return u.role === 'Manager' || this.hasDepartments();
  }

  load() {
    this.busy.set(true);
    this.error.set(null);
    this.actionMessage.set(null);
    this.mappingDegraded.set(false);

    this.usersService.getUsers().subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res : (res?.data ?? res?.users ?? res?.$values ?? []);
        const list = Array.isArray(raw) ? raw : [];
        this.managers.set(
          list
            .filter((x: any) => String(x.role ?? x.Role ?? '') === 'Manager' && Boolean(x.isActive ?? x.IsActive ?? true))
            .map((x: any) => ({
              id: Number(x.id ?? x.Id),
              name: String(x.name ?? x.Name ?? ''),
              email: String(x.email ?? x.Email ?? ''),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      },
      error: () => this.managers.set([]),
    });

    this.master.getDepartments().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.$values ?? []);
        this.allDepartments.set(normDeptList(list));
      },
      error: () => this.allDepartments.set([]),
    });

    this.master
      .getUserMapping(this.userId)
      .pipe(
        catchError((mappingErr: HttpErrorResponse) => {
          if (mappingErr.status !== 404) {
            return throwError(() => mappingErr);
          }
          return this.usersService.getUser(this.userId).pipe(
            switchMap((profile: any) => {
              if (!profile) return throwError(() => mappingErr);
              return of({
                user: profile,
                assignedDepartments: [],
                assignedProjects: [],
                availableProjects: [],
                _degraded: true as const,
              });
            }),
            catchError(() => throwError(() => mappingErr))
          );
        })
      )
      .subscribe({
        next: (res: any) => {
          const degraded = Boolean(res?._degraded);
          this.mappingDegraded.set(degraded);
          const raw = res?.user as any;
          const view: UserDetailView | null = raw
            ? {
                name: String(raw.name ?? raw.Name ?? ''),
                email: String(raw.email ?? raw.Email ?? ''),
                role: String(raw.role ?? raw.Role ?? ''),
                isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
                designation: String(raw.designation ?? raw.Designation ?? ''),
                managerId: raw.managerId ?? raw.ManagerId ?? null,
                contactNumber: String(raw.contactNumber ?? raw.ContactNumber ?? ''),
              }
            : null;
          this.user.set(view);
          if (view) {
            this.editRole = view.role;
            this.roleBeforeEdit = view.role;
            this.editName = view.name;
            this.editContactNumber = view.contactNumber ?? '';
            this.editDesignation = view.designation ?? '';
            this.editManagerId = view.managerId ?? null;
          } else {
            this.editRole = '';
            this.roleBeforeEdit = '';
            this.editName = '';
            this.editContactNumber = '';
            this.editDesignation = '';
            this.editManagerId = null;
          }
          this.assignedDepartments.set(normDeptList(res?.assignedDepartments));
          this.assignedProjects.set(normProjList(res?.assignedProjects));
          this.availableProjects.set(normProjList(res?.availableProjects));
          this.assignedEmployees.set(normEmployeeList(res?.assignedEmployees));
          this.leaveBalances.set(normLeaveBalances(res?.leaveBalances));
          this.selectedDeptIds.set(new Set(this.assignedDepartments().map((d) => d.id)));
          this.selectedProjectId = '';
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err));
          this.user.set(null);
          this.mappingDegraded.set(false);
          this.assignedEmployees.set([]);
          this.leaveBalances.set([]);
          this.selectedDeptIds.set(new Set());
        },
        complete: () => this.busy.set(false),
      });
  }

  toggleDeptSelection(deptId: number, ev: Event) {
    const checked = (ev.target as HTMLInputElement | null)?.checked ?? false;
    const next = new Set(this.selectedDeptIds());
    if (checked) next.add(deptId);
    else next.delete(deptId);
    this.selectedDeptIds.set(next);
  }

  saveDepartmentMapping() {
    const u = this.user();
    if (!u) return;
    const current = new Set(this.assignedDepartments().map((d) => d.id));
    const desired = this.selectedDeptIds();
    const toAdd = Array.from(desired).filter((id) => !current.has(id));
    const toRemove = Array.from(current).filter((id) => !desired.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      this.actionMessage.set('No department changes.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.actionMessage.set(null);

    const calls = [
      ...toAdd.map((id) => this.master.assignUserDepartment(this.userId, id)),
      ...toRemove.map((id) => this.master.unassignUserDepartment(this.userId, id)),
    ];

    forkJoin(calls).subscribe({
      next: () => {
        this.actionMessage.set('Departments updated.');
        this.load();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to update departments.');
        this.busy.set(false);
      },
    });
  }

  saveUser() {
    const u = this.user();
    if (!u) return;
    this.busy.set(true);
    this.error.set(null);
    this.actionMessage.set(null);
    this.usersService
      .updateUserMeta(this.userId, {
        name: this.editName,
        contactNumber: this.editContactNumber,
        designation: u.role === 'Admin' ? null : this.editDesignation,
        managerId: u.role === 'Employee' ? this.editManagerId : null,
      })
      .subscribe({
        next: (res: any) => {
          const nextName = res?.name ?? res?.Name ?? this.editName;
          const nextContact = res?.contactNumber ?? res?.ContactNumber ?? this.editContactNumber;
          const nextDesignation = res?.designation ?? res?.Designation ?? this.editDesignation;
          const nextManagerId = res?.managerId ?? res?.ManagerId ?? (u.role === 'Employee' ? this.editManagerId : null);
          this.user.update((v) =>
            v
              ? {
                  ...v,
                  name: String(nextName ?? ''),
                  contactNumber: String(nextContact ?? ''),
                  designation: String(nextDesignation ?? ''),
                  managerId: nextManagerId ?? null,
                }
              : null
          );
          this.actionMessage.set('User saved.');
          this.busy.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Failed to update user.');
          this.busy.set(false);
        },
      });
  }

  rememberRoleBefore() {
    const u = this.user();
    this.roleBeforeEdit = u?.role ?? '';
  }

  changeRole() {
    const u = this.user();
    if (!u) return;
    if (this.editRole === this.roleBeforeEdit) return;
    this.busy.set(true);
    this.error.set(null);
    this.actionMessage.set(null);
    this.usersService.updateRole(this.userId, this.editRole).subscribe({
      next: () => {
        this.user.update((v) => (v ? { ...v, role: this.editRole } : null));
        this.roleBeforeEdit = this.editRole;
        this.actionMessage.set('Role updated.');
        this.busy.set(false);
      },
      error: (err) => {
        this.editRole = this.roleBeforeEdit;
        this.error.set(
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message || 'Failed to update role.'
        );
        this.busy.set(false);
      },
    });
  }

  toggleStatus() {
    const u = this.user();
    if (!u) return;
    this.busy.set(true);
    this.error.set(null);
    this.actionMessage.set(null);
    this.usersService.toggleUser(this.userId).subscribe({
      next: (res: any) => {
        const nextActive = res?.isActive ?? res?.IsActive ?? !u.isActive;
        this.user.update((v) => (v ? { ...v, isActive: nextActive } : null));
        this.actionMessage.set(nextActive ? 'Account enabled.' : 'Account disabled.');
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to update status.');
        this.busy.set(false);
      },
    });
  }

  assignProject() {
    const id = Number(this.selectedProjectId);
    if (!id) return;
    this.error.set(null);
    this.actionMessage.set(null);
    this.busy.set(true);
    this.master.assignUserProject(this.userId, id).subscribe({
      next: () => {
        this.actionMessage.set('Project mapped.');
        this.load();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Could not assign project.');
        this.busy.set(false);
      },
    });
  }
}
