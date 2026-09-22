import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class SupabaseClientService {
  private supabase = supabase;

  getClient() {
    return this.supabase;
  }

  from(table: string) {
    return this.supabase.from(table);
  }

  auth() {
    return this.supabase.auth;
  }
}
