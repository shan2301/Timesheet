import { Routes } from '@angular/router';
import { AdminDepartmentsComponent } from './admin-departments/admin-departments.component';
import { AdminLeavePolicyComponent } from './admin-leave-policy/admin-leave-policy.component';
import { AdminProjectsComponent } from './admin-projects/admin-projects.component';
import { AdminTasksComponent } from './admin-tasks/admin-tasks.component';
import { AdminTimesheetsComponent } from './admin-timesheets/admin-timesheets.component';
import { AdminUserDetailComponent } from './admin-user-detail/admin-user-detail.component';
import { AdminUsersComponent } from './admin-users/admin-users.component';
import { ApproveComponent } from './approve/approve.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LeaveApprovalDetailComponent } from './leave-approval-detail/leave-approval-detail.component';
import { LeaveApprovalsComponent } from './leave-approvals/leave-approvals.component';
import { LeavesComponent } from './leaves/leaves.component';
import { LoginComponent } from './login/login.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { ProfileComponent } from './profile/profile.component';
import { TeamComponent } from './team/team.component';
import { TimesheetComponent } from './timesheet/timesheet.component';
import { WeeklyApprovalDetailComponent } from './weekly-approval-detail/weekly-approval-detail.component';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { employeeGuard } from './guards/employee.guard';
import { managerGuard } from './guards/manager.guard';
import { timesheetGuard } from './guards/timesheet.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: 'timesheet',
    component: TimesheetComponent,
    canActivate: [employeeGuard]
  },
  {
    path: 'team',
    component: TeamComponent,
    canActivate: [managerGuard]
  },
  {
    path: 'approve',
    component: ApproveComponent,
    canActivate: [managerGuard]
  },
  {
    path: 'approve/:id',
    component: WeeklyApprovalDetailComponent,
    canActivate: [managerGuard]
  },
  {
    path: 'leaves',
    component: LeavesComponent,
    canActivate: [timesheetGuard]
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [timesheetGuard]
  },
  {
    path: 'notifications',
    component: NotificationsComponent,
    canActivate: [authGuard]
  },
  {
    path: 'leave-approvals',
    component: LeaveApprovalsComponent,
    canActivate: [managerGuard]
  },
  {
    path: 'leave-approvals/:id',
    component: LeaveApprovalDetailComponent,
    canActivate: [managerGuard]
  },
  {
    path: 'admin/users',
    component: AdminUsersComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/users/:id',
    component: AdminUserDetailComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/departments',
    component: AdminDepartmentsComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/projects',
    component: AdminProjectsComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/tasks',
    component: AdminTasksComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/leave-policy',
    component: AdminLeavePolicyComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/all',
    component: AdminTimesheetsComponent,
    canActivate: [adminGuard]
  },
  {
    path: 'admin/timesheets',
    component: AdminTimesheetsComponent,
    canActivate: [adminGuard]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
