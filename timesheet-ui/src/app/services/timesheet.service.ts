import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TimesheetService {
  private readonly apiUrl = `${environment.apiUrl}/timesheet`;
  private readonly weeklyUrl = `${environment.apiUrl}/weekly-timesheet`;

  constructor(private http: HttpClient) {}

  getAll(page: number, pageSize: number) {
    return this.http.get(`${this.apiUrl}?page=${page}&pageSize=${pageSize}`);
  }

  create(data: any) {
    return this.http.post(this.apiUrl, data);
  }

  update(id: number, data: any) {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  getAllAdmin() {
    return this.http.get(`${this.apiUrl}/all`);
  }

  /** Manager / Admin: department-scoped (manager) or all (admin). */
  getManagerTimesheets() {
    return this.http.get<unknown[]>(`${this.apiUrl}/manager-timesheets`);
  }

  /** Manager/Admin: weekly timesheets pending approval (employees in scope). */
  getManagerWeeklyTimesheets() {
    return this.http.get<unknown[]>(`${this.weeklyUrl}/pending`);
  }

  approveWeeklyTimesheet(id: number) {
    return this.http.put(`${this.weeklyUrl}/approve/${id}`, {});
  }

  rejectWeeklyTimesheet(id: number) {
    return this.http.put(`${this.weeklyUrl}/reject/${id}`, {});
  }

  getWeeklyTimesheetById(id: number) {
    return this.http.get(`${this.weeklyUrl}/${id}`);
  }

  /** Manager/Admin: aggregated hours by project (for dashboard chart). */
  getProjectHoursReport() {
    return this.http.get<unknown[]>(`${this.apiUrl}/report/project-hours`);
  }

  approveTimesheet(id: number) {
    return this.http.put(`${this.apiUrl}/approve/${id}`, {});
  }

  rejectTimesheet(id: number) {
    return this.http.put(`${this.apiUrl}/reject/${id}`, {});
  }

  getMyWeek(weekStartDate: string) {
    return this.http.get(`${this.weeklyUrl}/my?weekStartDate=${encodeURIComponent(weekStartDate)}`);
  }

  /** Employee: list all weeks and statuses. */
  listMyWeeks() {
    return this.http.get<unknown[]>(`${this.weeklyUrl}/mine`);
  }

  saveWeek(payload: { weekStartDate: string; entries: any[] }) {
    return this.http.post(`${this.weeklyUrl}/save`, payload);
  }

  submitWeek(weekStartDate: string) {
    return this.http.post(`${this.weeklyUrl}/submit?weekStartDate=${encodeURIComponent(weekStartDate)}`, {});
  }

  /** Weekly timesheet export (Employee: current week; Manager/Admin: use exportWeeklyById). */
  exportMyWeeklyExcel(weekStartDate: string) {
    return this.http.get(`${this.weeklyUrl}/export?weekStartDate=${encodeURIComponent(weekStartDate)}`, {
      responseType: 'blob',
    });
  }

  /** Employee: consolidated monthly export (Approved entries only). */
  exportMyMonthlyExcel(year: number, month: number) {
    return this.http.get(`${this.weeklyUrl}/export-month?year=${year}&month=${month}`, { responseType: 'blob' });
  }

  /** Weekly timesheet export by submission id (Employee: own; Manager: scoped; Admin: any). */
  exportWeeklyById(id: number) {
    return this.http.get(`${this.weeklyUrl}/export/${id}`, { responseType: 'blob' });
  }

  /** Legacy daily timesheet rows; scope depends on role (Bearer via interceptor). */
  exportTimesheetsExcel() {
    return this.http.get(`${this.apiUrl}/export`, { responseType: 'blob' });
  }
}

