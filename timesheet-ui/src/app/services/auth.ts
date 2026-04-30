import { jwtDecode } from 'jwt-decode';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  apiUrl = 'http://localhost:5007/api/Auth';

  constructor(private http: HttpClient) {}

  login(data: any) {
    return this.http.post(`${this.apiUrl}/login`, data);
  }

  saveToken(token: string) {
    localStorage.setItem('token', token);
  }

  getToken() {
    return localStorage.getItem('token');
  }

  logout() {
    localStorage.removeItem('token');
  }

  getUserRole(): string | null {
    const token = this.getToken();
    if (!token) return null;

    const decoded: any = jwtDecode(token);
    return (
      decoded['role'] ||
      decoded['roles'] ||
      decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role']
    );
  }
}
