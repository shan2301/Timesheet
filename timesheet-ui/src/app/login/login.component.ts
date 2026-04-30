import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card">
      <div class="header">
        <div class="brand-lockup">
          <img
            class="brand-logo"
            src="images/LOGO%20copy.png"
            alt="Salem Infotech"
          />
          <p class="tagline-animate">Initiate. Ideate. Innovate</p>
        </div>
        <span class="pill">Timesheet</span>
      </div>

      <div class="card-body">
        <form class="stack" (ngSubmit)="login()">
          <div class="field">
            <label>Email</label>
            <input
              class="input"
              name="email"
              autocomplete="email"
              [(ngModel)]="loginData.email"
              required
            />
          </div>

          <div class="field">
            <label>Password</label>
            <input
              class="input"
              type="password"
              name="password"
              autocomplete="current-password"
              [(ngModel)]="loginData.password"
              required
            />
          </div>

          <div *ngIf="error" class="subtitle" style="color: rgba(171, 24, 16, 0.95);">
            {{ error }}
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit" [disabled]="loading">
              {{ loading ? 'Signing in…' : 'Login' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  loginData: any = { email: '', password: '' };
  loading = false;
  error: string | null = null;

  constructor(private authService: AuthService, private router: Router) {}

  login() {
    this.loading = true;
    this.error = null;

    this.authService.login(this.loginData).subscribe({
      next: (res: any) => {
        this.authService.saveToken(res.token);
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.error = err?.error?.message || 'Login failed. Please try again.';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}

