import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiUrl = `${environment.apiUrl}/user`;

  constructor(private http: HttpClient) {}

  me() {
    return this.http.get(`${this.apiUrl}/me`);
  }

  getUserProjects() {
    return this.http.get<unknown[]>(`${this.apiUrl}/projects`);
  }

  getActiveTasks() {
    return this.http.get<unknown[]>(`${this.apiUrl}/tasks`);
  }
}
