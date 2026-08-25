import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { environment } from '../../environments/environment';

export const supabase: any = createClient({
  auth: {
    url: environment.neonAuthUrl,
    adapter: SupabaseAuthAdapter(),
    allowAnonymous: true,
  },
  dataApi: {
    url: environment.neonDataApiUrl,
  },
});
