import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly apiUrl = `${environment.apiUrl}/Auth`;

  constructor(private http: HttpClient) {}

  getUsers() {
    return this.http.get(`${this.apiUrl}/users`);
  }

  getUser(id: number) {
    return this.http.get(`${this.apiUrl}/users/${id}`);
  }

  createUser(dto: any) {
    return this.http.post(`${this.apiUrl}/create-user`, dto);
  }

  updateRole(id: number, role: string) {
    return this.http.put(`${this.apiUrl}/update-role/${id}`, role, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  toggleUser(id: number) {
    return this.http.put(`${this.apiUrl}/toggle-user/${id}`, {});
  }

  updateUserMeta(
    id: number,
    dto: {
      name?: string | null;
      contactNumber?: string | null;
      designation?: string | null;
      managerId?: number | null;
    }
  ) {
    return this.http.put(`${this.apiUrl}/update-user-meta/${id}`, dto);
  }
}

