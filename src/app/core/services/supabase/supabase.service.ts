import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: any;

  constructor() {
    this.client = createClient(environment.supabase.url, environment.supabase.anonKey, {
      db: {
        schema: environment.supabase.schema
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }
}
