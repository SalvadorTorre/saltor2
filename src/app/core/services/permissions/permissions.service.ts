import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ADMIN_ONLY_SCREENS, ALL_ACTIONS, ALL_SCREENS, PERMISSION_MODULES, roleDefaults, screenForUrl } from './permission-catalog';

export interface UserPermissions {
  role: string;
  customized: boolean;
  screens: string[];
  actions: string[];
}

/** Accesos del usuario que inició sesión: pantallas que puede abrir y acciones que puede hacer. */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private loadedFor = '';
  private loading: Promise<void> | null = null;
  private role = '';
  private screens = new Set<string>();
  private actions = new Set<string>();

  constructor(private readonly supabase: SupabaseService, private readonly auth: AuthService) {}

  get isAdmin(): boolean { return this.role === 'Administrador'; }

  /** Carga (una vez por usuario y empresa) los accesos efectivos. */
  async ensureLoaded(): Promise<void> {
    const session = await this.auth.restoreSession();
    const key = session ? `${session.authUserId}:${session.companyId}:${session.role}` : '';
    if (key === this.loadedFor) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        if (!session) { this.apply('', [], []); return; }
        type Custom = { rol?: string; personalizado?: boolean; pantallas?: string[]; acciones?: string[] };
        let custom: Custom | null = null;
        try {
          const { data } = await this.supabase.client.rpc('mis_permisos');
          custom = (data ?? null) as Custom | null;
        } catch { custom = null; }
        const role = custom?.rol || session.role || '';
        if (role !== 'Administrador' && custom?.personalizado) this.apply(role, custom.pantallas ?? [], custom.acciones ?? []);
        else { const defaults = roleDefaults(role); this.apply(role, defaults.screens, defaults.actions); }
        this.loadedFor = key;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Vuelve a leer los accesos (después de iniciar sesión, cambiar de empresa o guardarlos). */
  async reload(): Promise<void> {
    this.loadedFor = '';
    await this.ensureLoaded();
  }

  /** ¿Puede abrir esta pantalla? Las pantallas fuera del catálogo (inicio, plataforma…) no se restringen aquí. */
  canOpen(url: string): boolean {
    const screen = screenForUrl(url);
    if (!screen) return true;
    if (ADMIN_ONLY_SCREENS.includes(screen)) return this.isAdmin;
    return this.isAdmin || this.screens.has(screen);
  }

  /** ¿Puede hacer esta acción (p. ej. "facturas.anular")? */
  can(action: string): boolean {
    return this.isAdmin || this.actions.has(action);
  }

  /** Igual que can(), pero avisa al usuario cuando no tiene el permiso. */
  ensure(action: string): boolean {
    if (this.can(action)) return true;
    const label = PERMISSION_MODULES.flatMap((m) => m.actions).find((a) => a.key === action)?.label ?? action;
    void Swal.fire({ icon: 'warning', title: 'Sin permiso', text: `No tienes permiso para: ${label.toLowerCase()}. Pídeselo al administrador.`, confirmButtonText: 'Entendido' });
    return false;
  }

  private apply(role: string, screens: string[], actions: string[]): void {
    this.role = role;
    this.screens = new Set(role === 'Administrador' ? ALL_SCREENS : screens);
    this.actions = new Set(role === 'Administrador' ? ALL_ACTIONS : actions);
  }
}
