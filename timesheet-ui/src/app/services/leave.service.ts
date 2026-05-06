import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LeaveService {
  private readonly baseUrl = `${environment.apiUrl}/Leave`;

  constructor(private http: HttpClient) {}

  get(id: number) {
    return this.http.get(`${this.baseUrl}/${id}`);
  }

  createLeave(dto: { startDate: string; endDate: string; type: string; reason?: string | null }) {
    return this.http.post(`${this.baseUrl}`, dto);
  }

  myLeaves() {
    return this.http.get(`${this.baseUrl}/my`);
  }

  balance() {
    return this.http.get(`${this.baseUrl}/balance`);
  }

  pendingLeaves() {
    return this.http.get(`${this.baseUrl}/pending`);
  }

  inboxLeaves() {
    return this.http.get(`${this.baseUrl}/inbox`);
  }

  approve(id: number, comment?: string | null) {
    return this.http.put(`${this.baseUrl}/approve/${id}`, { comment: comment || null });
  }

  reject(id: number, rejectionReason: string, comment?: string | null) {
    return this.http.put(`${this.baseUrl}/reject/${id}`, {
      rejectionReason,
      comment: comment || null,
    });
  }
}

