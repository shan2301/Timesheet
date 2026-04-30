import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiUrl = 'http://localhost:5007/api/user';

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
