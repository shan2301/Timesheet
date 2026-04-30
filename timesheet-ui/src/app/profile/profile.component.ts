import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { UserService } from '../services/user.service';

type Dept = { id: number; name: string };
type Manager = { id: number; name: string; email: string };
type Project = { id: number; name: string };
type Me = {
  id: number;
  name: string;
  email: string;
  contactNumber: string | null;
  role: string;
  designation: string | null;
  isActive: boolean;
  createdDate: string;
  manager: Manager | null;
  departments: Dept[];
};

function parseMe(res: any): Me {
  return {
    id: Number(res?.id ?? res?.Id ?? 0),
    name: String(res?.name ?? res?.Name ?? ''),
    email: String(res?.email ?? res?.Email ?? ''),
    contactNumber: (res?.contactNumber ?? res?.ContactNumber ?? null) as any,
    role: String(res?.role ?? res?.Role ?? ''),
    designation: (res?.designation ?? res?.Designation ?? null) as any,
    isActive: Boolean(res?.isActive ?? res?.IsActive ?? true),
    createdDate: String(res?.createdDate ?? res?.CreatedDate ?? ''),
    manager: (res?.manager ?? res?.Manager ?? null) as any,
    departments: (Array.isArray(res?.departments) ? res.departments : res?.departments?.$values) || [],
  };
}

function parseProjects(res: unknown): Project[] {
  if (Array.isArray(res)) return res.map((x: any) => ({ id: Number(x?.id ?? x?.Id), name: String(x?.name ?? x?.Name ?? '') }));
  if (res && typeof res === 'object') {
    const o = res as any;
    const arr = Array.isArray(o?.data) ? o.data : Array.isArray(o?.$values) ? o.$values : null;
    if (Array.isArray(arr)) return arr.map((x: any) => ({ id: Number(x?.id ?? x?.Id), name: String(x?.name ?? x?.Name ?? '') }));
  }
  return [];
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">My Profile</h2>
          <p class="subtitle">Your account details.</p>
        </div>
      </div>

      <div class="card-body stack">
        <div *ngIf="error()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ error() }}
        </div>

        <div *ngIf="busy()" class="subtitle">Loading…</div>

        <div *ngIf="me()" class="stack">
          <div class="grid-2-1" style="align-items: stretch;">
            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Basic</div>
                <div class="title" style="font-size: 18px; margin-top: 8px;">{{ me()!.name }}</div>
                <div class="subtitle" style="margin-top: 6px;">{{ me()!.email }}</div>

                <div class="row" style="margin-top: 16px;">
                  <div>
                    <div class="subtitle" style="margin:0;">Contact number</div>
                    <div style="font-weight: 800; margin-top: 6px;">{{ me()!.contactNumber || '—' }}</div>
                  </div>
                  <div>
                    <div class="subtitle" style="margin:0;">Designation</div>
                    <div style="font-weight: 800; margin-top: 6px;">{{ me()!.designation || '—' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Account</div>
                <div class="row" style="margin-top: 12px;">
                  <div>
                    <div class="subtitle" style="margin:0;">Role</div>
                    <div style="font-weight: 800; margin-top: 6px;">{{ me()!.role }}</div>
                  </div>
                  <div>
                    <div class="subtitle" style="margin:0;">Status</div>
                    <div style="font-weight: 800; margin-top: 6px;">{{ me()!.isActive ? 'Active' : 'Disabled' }}</div>
                  </div>
                </div>
                <div style="margin-top: 12px;">
                  <div class="subtitle" style="margin:0;">Created</div>
                  <div style="font-weight: 800; margin-top: 6px;">{{ me()!.createdDate | date : 'dd-MMM-yyyy' }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="grid-2-1" style="align-items: stretch;">
            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Departments</div>
                <div *ngIf="me()!.departments.length; else noDepts" class="pillwrap" style="margin-top: 10px;">
                  <span class="pill pill-dept" *ngFor="let d of me()!.departments">{{ d.name }}</span>
                </div>
                <ng-template #noDepts>
                  <div class="subtitle" style="margin-top: 10px;">—</div>
                </ng-template>
              </div>
            </div>

            <div class="card card-soft">
              <div class="card-body">
                <div class="subtitle" style="margin:0;">Manager</div>
                <div *ngIf="me()!.manager; else noMgr">
                  <div style="font-weight: 900; margin-top: 10px;">{{ me()!.manager!.name }}</div>
                  <div class="subtitle" style="margin-top: 6px;">{{ me()!.manager!.email }}</div>
                </div>
                <ng-template #noMgr>
                  <div class="subtitle" style="margin-top: 10px;">—</div>
                </ng-template>
              </div>
            </div>
          </div>

          <div class="card card-soft">
            <div class="card-body">
              <div class="subtitle" style="margin:0;">Assigned projects</div>
              <div *ngIf="projects().length; else noProjects" class="pillwrap" style="margin-top: 10px;">
                <span class="pill pill-proj" *ngFor="let p of projects()">{{ p.name }}</span>
              </div>
              <ng-template #noProjects>
                <div class="subtitle" style="margin-top: 10px;">—</div>
              </ng-template>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly me = signal<Me | null>(null);
  readonly projects = signal<Project[]>([]);

  constructor(private users: UserService) {}

  ngOnInit() {
    this.busy.set(true);
    this.error.set(null);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.busy.set(false);
    };

    this.users.me().subscribe({
      next: (res) => this.me.set(parseMe(res)),
      error: (err) => this.error.set(err?.error?.message || 'Failed to load profile.'),
      complete: done,
    });

    this.users.getUserProjects().subscribe({
      next: (res) => this.projects.set(parseProjects(res)),
      error: () => this.projects.set([]),
      complete: done,
    });
  }
}

