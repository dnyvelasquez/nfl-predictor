import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { supabase } from './core/supabase.client';
import { AuthService, Rol } from './services/auth/auth';

export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const router = inject(Router);

  const r1 = await supabase.auth.getSession();
  if (r1.data.session) return true;

  const session = await new Promise<any>((resolve) => {
    let finished = false;
    const finish = (s: any) => {
      if (finished) return;
      finished = true;
      sub?.subscription.unsubscribe();
      resolve(s);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_ev: any, s: any) => finish(s));

    setTimeout(async () => {
      const r2 = await supabase.auth.getSession();
      finish(r2.data.session ?? null);
    }, 400);
  });

  return session ? true : router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

// Va después de authGuard: deja pasar solo a los roles indicados y manda al resto a /admin.
export const rolGuard = (...roles: Rol[]): CanActivateFn => async () => {
  const router = inject(Router);
  const rol = await firstValueFrom(inject(AuthService).getRol$());
  return rol && roles.includes(rol) ? true : router.createUrlTree(['/admin']);
};
