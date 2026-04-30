import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MasterDataService } from '../services/master-data.service';

type TaskRow = { id: number; name: string; isActive: boolean };

function parseList(res: unknown): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o['data'])) return o['data'] as any[];
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  return [];
}

function normTask(raw: any): TaskRow {
  return {
    id: Number(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
  };
}

@Component({
  selector: 'app-admin-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="header">
        <div>
          <h2 class="title">Task Master</h2>
          <p class="subtitle">Create tasks that employees can pick in timesheets (coming next).</p>
        </div>
        <button class="btn btn-link" routerLink="/dashboard">Back</button>
      </div>

      <div class="card-body stack">
        <div class="card" style="box-shadow: none; background: rgba(255, 255, 255, 0.55);">
          <div class="card-body">
            <h3 class="title" style="font-size: 16px; margin-bottom: 10px;">Add task</h3>
            <form class="stack" (ngSubmit)="createTask()">
              <div class="row">
                <div class="field" style="flex: 1;">
                  <label>Task name</label>
                  <input class="input" name="taskName" [(ngModel)]="create.name" placeholder="e.g. Development" required />
                </div>
              </div>

              <div *ngIf="formError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
                {{ formError() }}
              </div>
              <div *ngIf="success()" class="subtitle" style="color: rgba(22, 122, 51, 0.95);">
                {{ success() }}
              </div>

              <div class="actions" style="justify-content: flex-start;">
                <button class="btn btn-primary" type="submit" [disabled]="busy()">
                  {{ busy() ? 'Saving…' : 'Create task' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="actions" style="justify-content: space-between;">
          <div class="subtitle" style="margin:0;">{{ tasks().length }} tasks</div>
          <button class="btn" type="button" (click)="loadTasks()" [disabled]="busy()">Refresh</button>
        </div>

        <div *ngIf="listError()" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
          {{ listError() }}
        </div>

        <table class="table" *ngIf="tasks().length; else empty">
          <thead>
            <tr>
              <th>Id</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tasks()">
              <td>{{ t.id }}</td>
              <td>{{ t.name }}</td>
              <td>
                <span class="pill" [class.active]="t.isActive" [class.inactive]="!t.isActive">
                  {{ t.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <div class="subtitle">No tasks yet.</div>
        </ng-template>
      </div>
    </div>
  `,
})
export class AdminTasksComponent implements OnInit {
  readonly tasks = signal<TaskRow[]>([]);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  create: { name: string } = {
    name: '',
  };

  constructor(private master: MasterDataService) {}

  ngOnInit() {
    this.loadTasks();
  }

  loadTasks() {
    this.busy.set(true);
    this.listError.set(null);
    this.master.getTasks().subscribe({
      next: (res) => {
        this.tasks.set(parseList(res).map(normTask));
      },
      error: (err) => {
        this.listError.set(err?.error?.message || 'Failed to load tasks.');
        this.tasks.set([]);
      },
      complete: () => this.busy.set(false),
    });
  }

  createTask() {
    const name = this.create.name.trim();
    if (!name) {
      this.formError.set('Task name is required.');
      return;
    }
    this.formError.set(null);
    this.success.set(null);
    this.busy.set(true);
    this.master.createTask(name).subscribe({
      next: () => {
        this.create.name = '';
        this.success.set('Task created.');
        this.loadTasks();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Failed to create task.');
        this.busy.set(false);
      },
    });
  }
}

