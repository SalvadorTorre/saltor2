import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

/**
 * Configuración en tiempo de ejecución (src/config.js).  En la nube es null; una
 * instalación local la define para usar la API de su propio servidor.
 */
export interface SaltorRuntimeConfig {
  instalacionLocal?: boolean;
  cliente?: string;
  version?: string;
  supabaseUrl?: string;
  anonKey?: string;
}

export const runtimeConfig: SaltorRuntimeConfig | null =
  (typeof window !== 'undefined' ? (window as unknown as { SALTOR_CONFIG?: SaltorRuntimeConfig | null }).SALTOR_CONFIG : null) ?? null;

/** Evento que avisa a la pantalla principal que la sesión venció y no se pudo renovar. */
export const SESSION_EXPIRED_EVENT = 'saltor:session-expired';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: any;
  private refreshing: Promise<string | null> | null = null;

  constructor() {
    const url = runtimeConfig?.supabaseUrl || environment.supabase.url;
    const anonKey = runtimeConfig?.anonKey || environment.supabase.anonKey;
    this.client = createClient(url, anonKey, {
      db: {
        schema: environment.supabase.schema
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => this.fetchWithRefresh(input, init)
      }
    });

    // Al volver a la pestaña (o despertar la computadora) se renueva la sesión antes
    // de que el usuario guarde algo con el token vencido.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.client.auth.getSession();
      });
    }
  }

  /**
   * El token de acceso dura una hora. Si la computadora estuvo suspendida o la pestaña
   * en segundo plano, puede vencer sin renovarse y la base de datos responde "JWT expired".
   * En ese caso se renueva la sesión y se repite la operación una sola vez.
   */
  private async fetchWithRefresh(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (response.status !== 401 || url.includes('/auth/v1/')) return response;

    const body = await response.clone().text().catch(() => '');
    if (!/jwt expired|invalid jwt|token is expired/i.test(body)) return response;

    const token = await this.refreshToken();
    if (!token) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      return response;
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  private refreshToken(): Promise<string | null> {
    this.refreshing ??= (async () => {
      try {
        const { data, error } = await this.client.auth.refreshSession();
        return error ? null : (data?.session?.access_token ?? null);
      } catch {
        return null;
      } finally {
        setTimeout(() => (this.refreshing = null), 0);
      }
    })();
    return this.refreshing;
  }
}
