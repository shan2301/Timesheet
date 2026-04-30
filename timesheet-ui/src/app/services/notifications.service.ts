import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

export type NotificationRow = {
  id: number;
  message: string;
  isRead: boolean;
  createdDate: string;
};

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly baseUrl = 'http://localhost:5007/api/Notifications';

  constructor(private http: HttpClient) {}

  my(take = 30) {
    return this.http.get<NotificationRow[]>(`${this.baseUrl}?take=${take}`);
  }

  unreadCount() {
    return this.http.get<{ count: number }>(`${this.baseUrl}/unread-count`);
  }

  markRead(id: number) {
    return this.http.put(`${this.baseUrl}/${id}/read`, {});
  }

  markAllRead() {
    return this.http.put<{ updated: number }>(`${this.baseUrl}/read-all`, {});
  }
}

