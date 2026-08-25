import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { supabase } from './core/supabase.client';

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
