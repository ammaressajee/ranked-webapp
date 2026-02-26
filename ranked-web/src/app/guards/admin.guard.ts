import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { map, take } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const adminService = inject(AdminService);
  const router = inject(Router);

  return adminService.isAdmin$.pipe(
    take(1),
    map((isAdmin) => {
      if (isAdmin) return true;
      router.navigate(['/']);
      return false;
    })
  );
};
