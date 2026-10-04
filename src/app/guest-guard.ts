import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './services/auth/auth';

export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const svc = inject(AuthService);
  const isAuth = await firstValueFrom(svc.isAuthenticated$());
  if (!isAuth) return true;
  // Ya hay sesión: admin a /admin, solo lectura a la portada.
  const esAdmin = await firstValueFrom(svc.esAdministrador$());
  return router.createUrlTree([esAdmin ? '/admin' : '/']);
};
