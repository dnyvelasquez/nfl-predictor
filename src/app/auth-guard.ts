import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { supabase } from './core/supabase.client';
import { AuthService } from './services/auth/auth';

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

// Va después de authGuard. 'superusuario': solo el super usuario.
// 'administrador': super usuario o administrador de al menos un grupo.
// Quien no cumple va a /admin si administra algo, o a la portada si es solo
// lectura (los usuarios de solo lectura no entran a ninguna página de admin).
export const rolGuard = (minimo: 'superusuario' | 'administrador'): CanActivateFn => async () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const esAdmin = await firstValueFrom(auth.esAdministrador$());
  const permitido = minimo === 'superusuario' ? await firstValueFrom(auth.esSuperusuario$()) : esAdmin;
  if (permitido) return true;
  return router.createUrlTree([esAdmin ? '/admin' : '/']);
};
