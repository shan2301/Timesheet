import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private readonly baseUrl = 'http://localhost:5007/api/MasterData';

  constructor(private http: HttpClient) {}

  getDepartments() {
    return this.http.get<unknown[]>(`${this.baseUrl}/departments`);
  }

  getProjects() {
    return this.http.get<unknown[]>(`${this.baseUrl}/projects`);
  }

  getTasks() {
    return this.http.get<unknown[]>(`${this.baseUrl}/tasks`);
  }

  getLeavePolicies() {
    return this.http.get<unknown[]>(`${this.baseUrl}/leave-policies`);
  }

  upsertLeavePolicy(dto: { type: string; maxUnitsPerYear: number | null }) {
    return this.http.put(`${this.baseUrl}/leave-policy`, dto);
  }

  createTask(name: string) {
    return this.http.post(`${this.baseUrl}/task`, { name });
  }

  getUserMapping(userId: number) {
    return this.http.get<unknown>(`${this.baseUrl}/user/${userId}/mapping`);
  }

  createDepartment(name: string) {
    return this.http.post(`${this.baseUrl}/department`, { name });
  }

  createProject(name: string, departmentId: number) {
    return this.http.post(`${this.baseUrl}/project`, { name, departmentId });
  }

  toggleProject(projectId: number) {
    return this.http.put(`${this.baseUrl}/toggle-project/${projectId}`, {});
  }

  assignUserProject(userId: number, projectId: number) {
    const params = new HttpParams().set('userId', String(userId)).set('projectId', String(projectId));
    return this.http.post(`${this.baseUrl}/assign-user-project`, {}, { params });
  }

  assignUserDepartment(userId: number, departmentId: number) {
    const params = new HttpParams()
      .set('userId', String(userId))
      .set('departmentId', String(departmentId));
    return this.http.post(`${this.baseUrl}/assign-user-department`, {}, { params });
  }

  unassignUserDepartment(userId: number, departmentId: number) {
    const params = new HttpParams()
      .set('userId', String(userId))
      .set('departmentId', String(departmentId));
    return this.http.delete(`${this.baseUrl}/unassign-user-department`, { params });
  }
}
