import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getDecodedRole } from './role.utils';

export const timesheetGuard: CanActivateFn = () => {
  const router = inject(Router);

  const token = localStorage.getItem('token');

  if (!token) {
    router.navigate(['/login']);
    return false;
  }

  const role = getDecodedRole(token);

  if (role === 'Employee' || role === 'Manager') {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

