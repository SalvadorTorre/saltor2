import { EcfService } from './core/services/ecf/ecf.service';
import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AppDataService } from './app-data.service';
import { ActiveUserSession, AuthService } from './core/services/auth/auth.service';
import { DisplayPreferencesService } from './core/services/display-preferences/display-preferences.service';
import { CompanyBrandingService } from './core/services/company-branding/company-branding.service';
import { CompaniesService } from './core/services/companies/companies.service';
import { CompanyBillingModeService } from './core/services/printing/company-billing-mode.service';
import { SESSION_EXPIRED_EVENT } from './core/services/supabase/supabase.service';
import Swal from 'sweetalert2';
import { PlatformNotice, PlatformService, SubscriptionNotice } from './core/services/platform/platform.service';
import { CompanyModule, CompanyModulesService } from './core/services/company-modules/company-modules.service';

const HIDDEN_NOTICES_KEY = 'saltor-avisos-ocultos';

export interface MenuLink {
  label: string;
  path: string;
  /** Solo lo ve el rol Administrador (la ruta también lo exige). */
  adminOnly?: boolean;
  /** Solo en empresas con modo de facturación "Cobro en caja". */
  cashierModeOnly?: boolean;
  /** Módulo que la empresa debe tener contratado. */
  module?: CompanyModule;
}

export interface MenuGroup {
  title?: string;
  /** Ícono y color del subtítulo en el menú lateral. */
  icon?: string;
  color?: string;
  links: MenuLink[];
}

export interface MenuSection {
  /** Primer segmento de la URL que pertenece a la sección. */
  key: string;
  label: string;
  icon: string;
  /** Sección sin submenú: el botón superior navega directo aquí. */
  path?: string;
  /** Submenú que se muestra en la barra lateral. */
  groups?: MenuGroup[];
  /** Solo la ven los dueños del sistema. */
  ownerOnly?: boolean;
  /** Módulo que habilita la sección superior. */
  module?: CompanyModule;
}

// Primer segmento de la URL -> sección, cuando no coinciden.
const SECTION_BY_SEGMENT: Record<string, string> = {
  inicio: 'dashboard',
  mantenimiento: 'maintenance',
  configuracion: 'settings',
  plataforma: 'plataforma',
  transacciones: 'transacciones'
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private readonly ecf = inject(EcfService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  isCheckingSession = true;
  activeUser: ActiveUserSession | null = null;
  isUserMenuOpen = false;
  /** Menú lateral en pantallas pequeñas (en escritorio se muestra fijo). */
  isSidebarOpen = false;
  /** Sección superior abierta; puede mostrar su submenú sin cambiar de pantalla. */
  activeTopSection = 'dashboard';

  readonly sections: MenuSection[] = [
    { key: 'dashboard', label: 'Inicio', icon: 'home', path: '/inicio' },
    {
      key: 'maintenance', label: 'Mantenimiento', icon: 'wrench', module: 'mantenimiento', groups: [
        {
          title: 'Contactos', icon: 'users', color: '#0ea5e9', links: [
            { label: 'Clientes', path: '/mantenimiento/clientes' },
            { label: 'Suplidores', path: '/mantenimiento/suplidores' }
          ]
        },
        {
          title: 'Inventario', icon: 'box', color: '#f59e0b', links: [
            { label: 'Productos', path: '/mantenimiento/productos' },
            { label: 'Entrada de producto', path: '/mantenimiento/entrada-productos' },
            { label: 'Kardex y ajustes', path: '/mantenimiento/kardex' }
          ]
        }
      ]
    },
    {
      key: 'settings', label: 'Configuración', icon: 'settings', module: 'configuracion', groups: [
        {
          title: 'Empresa y seguridad', icon: 'shield', color: '#8b5cf6', links: [
            { label: 'Empresa', path: '/configuracion/empresa', adminOnly: true },
            { label: 'Usuarios', path: '/configuracion/usuarios', adminOnly: true },
            { label: 'Firma digital DGII', path: '/configuracion/firma-digital' },
            { label: 'Bitácora', path: '/configuracion/bitacora', adminOnly: true }
          ]
        },
        {
          title: 'General', icon: 'sliders', color: '#64748b', links: [
            { label: 'Otros', path: '/configuracion/otros' },
            { label: 'Soporte', path: '/configuracion/soporte' }
          ]
        }
      ]
    },
    { key: 'facturacion', label: 'Facturación', icon: 'file-text', path: '/facturacion', module: 'facturacion' },
    { key: 'cotizaciones', label: 'Cotización', icon: 'clipboard', path: '/cotizaciones', module: 'cotizacion' },
    {
      key: 'transacciones', label: 'Transacciones', icon: 'briefcase', module: 'transacciones', groups: [
        {
          title: 'Documentos comerciales', icon: 'clipboard', color: '#f97316', links: [
            { label: 'Orden de venta', path: '/transacciones/orden-venta' },
            { label: 'Facturación', path: '/transacciones/facturacion' },
            { label: 'Cotización', path: '/transacciones/cotizacion' },
            { label: 'Conduce', path: '/transacciones/conduce' }
          ]
        }
      ]
    },
    {
      key: 'caja', label: 'Caja', icon: 'wallet', module: 'caja', groups: [
        {
          title: 'Operación de caja', icon: 'cash', color: '#10b981', links: [
            { label: 'Cobro de facturas', path: '/caja/cobro', cashierModeOnly: true },
            { label: 'Apertura', path: '/caja/apertura' },
            { label: 'Cierre', path: '/caja/cierre' },
            { label: 'Histórico', path: '/caja/historico' }
          ]
        }
      ]
    },
    {
      key: 'contabilidad', label: 'Contabilidad', icon: 'calculator', module: 'contabilidad', groups: [
        {
          title: 'Reportes fiscales', icon: 'landmark', color: '#ef4444', links: [
            { label: 'Panel fiscal', path: '/contabilidad/panel-fiscal' },
            { label: 'Rep. 607', path: '/contabilidad/rep-607' },
            { label: 'Rep. 606', path: '/contabilidad/rep-606' },
            { label: 'Anulados (608)', path: '/contabilidad/anulados' },
            { label: 'e-NCF', path: '/contabilidad/e-ncf' }
          ]
        },
        {
          title: 'Operaciones', icon: 'briefcase', color: '#3b82f6', links: [
            { label: 'Facturas pendientes', path: '/contabilidad/facturas-pendientes' },
            { label: 'Nota de crédito', path: '/contabilidad/notas-credito' },
            { label: 'Gastos menores', path: '/contabilidad/gastos-menores' },
            { label: 'Cuentas por cobrar', path: '/contabilidad/cuentas-por-cobrar' },
            { label: 'Compra informal E41', path: '/contabilidad/compras-e41' }
          ]
        }
      ]
    },
    {
      key: 'reportes', label: 'Reportes', icon: 'chart', module: 'reportes', groups: [
        {
          title: 'Ventas', icon: 'trending', color: '#22c55e', links: [
            { label: 'Venta por productos', path: '/reportes/productos' },
            { label: 'Ventas', path: '/reportes/ventas' },
            { label: 'Análisis de ventas', path: '/reportes/analisis' }
          ]
        }
      ]
    },
    {
      key: 'plataforma', label: 'Plataforma', icon: 'globe', ownerOnly: true, groups: [
        {
          title: 'Clientes', icon: 'building', color: '#7c3aed', links: [
            { label: 'Empresas y suscripciones', path: '/plataforma/empresas' },
            { label: 'Envío gradual de proformas', path: '/plataforma/proformas-programadas' },
            { label: 'Contratos', path: '/plataforma/contratos' },
            { label: 'Instalaciones locales', path: '/plataforma/instalaciones' },
            { label: 'Instalador local', path: '/plataforma/instalador' },
            { label: 'Salud y respaldos', path: '/plataforma/salud' }
          ]
        },
        {
          title: 'Atención', icon: 'support', color: '#f59e0b', links: [
            { label: 'Soporte (tickets)', path: '/plataforma/soporte' },
            { label: 'Avisos a usuarios', path: '/plataforma/avisos' }
          ]
        },
        {
          title: 'Cobros', icon: 'cash', color: '#10b981', links: [
            { label: 'Pagos recibidos', path: '/plataforma/pagos' },
            { label: 'Planes', path: '/plataforma/planes' }
          ]
        },
        {
          title: 'Control', icon: 'shield', color: '#64748b', links: [
            { label: 'Bitácora', path: '/plataforma/bitacora' }
          ]
        }
      ]
    }
  ];

  constructor(
    public data: AppDataService,
    private readonly auth: AuthService,
    private readonly displayPreferences: DisplayPreferencesService,
    private readonly branding: CompanyBrandingService,
    private readonly companies: CompaniesService,
    private readonly platform: PlatformService,
    private readonly billingMode: CompanyBillingModeService,
    private readonly companyModules: CompanyModulesService
  ) {}

  /** La empresa cobra en caja: se muestra Caja → Cobro de facturas. */
  isCashierMode = false;

  /** Dueño del sistema: ve la sección Plataforma. */
  isPlatformOwner = false;
  activeModules: CompanyModule[] = [];
  /** Aviso de suscripción de la empresa (solo informa, nunca bloquea). */
  subscriptionNotice: SubscriptionNotice | null = null;
  isNoticeDismissed = false;
  /** Avisos publicados desde Plataforma para esta empresa o para todas. */
  platformNotices: PlatformNotice[] = [];

  private noticeKey(n: PlatformNotice): string { return `${n.id}:${n.titulo}:${n.mensaje ?? ''}`; }

  private hiddenNotices(): string[] {
    try { return JSON.parse(localStorage.getItem(HIDDEN_NOTICES_KEY) ?? '[]') as string[]; } catch { return []; }
  }

  hideNotice(n: PlatformNotice): void {
    this.platformNotices = this.platformNotices.filter((x) => x !== n);
    try { localStorage.setItem(HIDDEN_NOTICES_KEY, JSON.stringify([...this.hiddenNotices(), this.noticeKey(n)].slice(-100))); } catch { /* sin almacenamiento */ }
  }

  noticeClass(n: PlatformNotice): string {
    return n.nivel === 'Urgente' ? 'danger' : n.nivel === 'Advertencia' ? 'warn' : 'info';
  }

  get visibleSections(): MenuSection[] {
    return this.sections.filter((section) =>
      (!section.ownerOnly || this.isPlatformOwner)
      && (!section.module || this.activeModules.includes(section.module))
    );
  }

  get noticeLevel(): string {
    const state = this.subscriptionNotice?.estado_calculado;
    if (state === 'Vencida' || state === 'Suspendida' || state === 'Cancelada') return 'danger';
    if (state === 'En gracia') return 'warn';
    return 'info';
  }

  private async loadSessionExtras(): Promise<void> {
    if (!this.activeUser) { this.isPlatformOwner = false; this.activeModules = []; this.subscriptionNotice = null; this.platformNotices = []; return; }
    const [owner, notice, notices, mode, modules] = await Promise.all([this.companies.isPlatformOwner(), this.platform.getNotice(), this.platform.getActiveNotices(), this.billingMode.getMode(), this.companyModules.getActiveModules(this.activeUser.companyId)]);
    this.isCashierMode = mode === 'Caja';
    this.isPlatformOwner = owner;
    this.activeModules = modules;
    const hidden = this.hiddenNotices();
    this.platformNotices = notices.filter((n) => !hidden.includes(this.noticeKey(n)));
    this.subscriptionNotice = notice?.mensaje ? notice : null;
    this.isNoticeDismissed = false;
  }

  /** Logo de la empresa activa; si no tiene, se usa el del sistema. */
  companyLogo: string | null = null;

  /** La sesión venció y no se pudo renovar (p. ej. la computadora estuvo apagada mucho tiempo). */
  @HostListener('window:' + SESSION_EXPIRED_EVENT)
  async onSessionExpired(): Promise<void> {
    if (!this.activeUser || this.isSessionExpiredNotice) return;
    this.isSessionExpiredNotice = true;
    await Swal.fire({ icon: 'info', title: 'Tu sesión venció', text: 'Por seguridad debes volver a entrar. Lo que no se guardó hay que repetirlo.', confirmButtonText: 'Entrar de nuevo' });
    this.isSessionExpiredNotice = false;
    await this.logout();
  }
  private isSessionExpiredNotice = false;

  async ngOnInit(): Promise<void> {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.syncMenuWithUrl(event.urlAfterRedirects));

    this.displayPreferences.apply(this.displayPreferences.getProfile());
    this.displayPreferences.applyTheme(this.displayPreferences.getTheme());
    this.branding.logo$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((logo) => this.companyLogo = logo);
    this.activeUser = await this.auth.restoreSession();
    if (this.activeUser) void this.ecf.resumePending(this.activeUser.companyId, this.activeUser.branchId);
    void this.branding.load(this.activeUser?.companyId);
    void this.loadSessionExtras();
    this.isCheckingSession = false;
  }

  get companyName(): string { return this.activeUser?.companyName ?? this.data.companyName; }
  get userName(): string { return this.activeUser?.fullName ?? this.data.userName; }
  get userEmail(): string { return this.activeUser?.email ?? this.data.userEmail; }
  get userInitials(): string {
    return this.userName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'US';
  }
  get todayLabel(): string { return this.data.todayLabel; }

  get isAdmin(): boolean { return this.activeUser?.role === 'Administrador'; }

  get activeSection(): MenuSection | null {
    return this.sections.find((section) => section.key === this.activeTopSection) ?? null;
  }

  /** En escritorio la barra lateral solo aparece en secciones con submenú. */
  get hasSidebar(): boolean {
    return Boolean(this.activeSection?.groups?.length);
  }

  visibleLinks(links: MenuLink[]): MenuLink[] {
    // La base de datos y la guarda de ruta ya bloquean estas pantallas a quien
    // no es administrador; aquí solo se ocultan del menú.
    return links.filter((link) =>
      (this.isAdmin || !link.adminOnly)
      && (!link.cashierModeOnly || this.isCashierMode)
      && (!link.module || this.activeModules.includes(link.module))
    );
  }

  onLoggedIn(user: ActiveUserSession): void {
    this.activeUser = user;
    this.ecf.stopTracking();
    void this.ecf.resumePending(user.companyId, user.branchId);
    void this.branding.load(user.companyId);
    void this.loadSessionExtras();
  }

  async logout(): Promise<void> {
    this.ecf.stopTracking();
    this.isUserMenuOpen = false;
    try {
      await this.auth.signOut();
    } finally {
      // Siempre vuelve a la pantalla de acceso, aun si el servidor no responde.
      // Se regresa al inicio para que el próximo usuario no abra la última
      // pantalla del anterior.
      this.activeUser = null;
      this.isPlatformOwner = false;
      this.subscriptionNotice = null;
      void this.router.navigateByUrl('/inicio');
    }
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  isPriceLookupOpen = false;

  openPriceLookup(): void {
    this.isUserMenuOpen = false;
    this.isPriceLookupOpen = true;
  }

  @HostListener('document:keydown.f2', ['$event'])
  onPriceLookupShortcut(event: Event): void {
    if (!this.activeUser) return;
    event.preventDefault();
    this.openPriceLookup();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  @HostListener('document:click')
  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.isUserMenuOpen = false;
    this.isPriceLookupOpen = false;
    this.isSidebarOpen = false;
  }

  selectSection(section: MenuSection): void {
    this.activeTopSection = section.key;
    // Sin submenú navega directo; con submenú abre la primera opción que el usuario puede ver,
    // salvo que ya esté en una pantalla de esa sección.
    const target = section.path ?? this.firstVisiblePath(section);
    if (!target) return;
    const currentSegment = this.router.url.split(/[/?#]/).filter(Boolean)[0] ?? '';
    const sectionSegment = target.split('/').filter(Boolean)[0] ?? '';
    if (section.path || currentSegment !== sectionSegment) void this.router.navigateByUrl(target);
  }

  private firstVisiblePath(section: MenuSection): string | null {
    for (const group of section.groups ?? []) {
      const link = this.visibleLinks(group.links)[0];
      if (link) return link.path;
    }
    return null;
  }

  syncMenuWithUrl(url: string): void {
    const segment = url.split(/[/?#]/).filter(Boolean)[0] ?? 'inicio';
    this.activeTopSection = SECTION_BY_SEGMENT[segment] ?? segment;
    this.isSidebarOpen = false;
  }

  /**
   * Enter en un campo de un formulario pasa al siguiente campo (nunca a un botón ni envía el
   * formulario). Los botones se alcanzan con Tab. Las pantallas que ya manejan su propio
   * Enter (buscar producto, agregar línea…) llaman preventDefault y aquí se respetan.
   * Un campo puede pedir el comportamiento normal con data-enter="native".
   * En cuadros de texto de varias líneas, Shift+Enter escribe un salto de línea.
   */
  @HostListener('document:keydown', ['$event'])
  onEnterMoveToNextField(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    // En cuadros de varias líneas, Shift+Enter hace el salto de línea.
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target instanceof HTMLInputElement && ['button', 'submit', 'reset', 'image', 'file', 'range', 'color'].includes(target.type)) return;
    if (!target.closest('.workspace-area') || target.closest('[data-enter="native"]')) return;

    event.preventDefault();
    const scope = target.closest('form, [role="dialog"], .modal, [class*="modal__panel"], [class*="-modal"]') ?? target.closest('.workspace-area') ?? document.body;
    const fields = Array.from(scope.querySelectorAll<HTMLElement>('input, select, textarea')).filter((el) => {
      if (el instanceof HTMLInputElement && ['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(el.type)) return false;
      if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
      if (el.getAttribute('tabindex') === '-1' || el.closest('[hidden], [aria-hidden="true"]')) return false;
      return el.offsetParent !== null || el.getClientRects().length > 0;
    });
    const next = fields[fields.indexOf(target) + 1];
    if (!next) return;
    next.focus();
    if (next instanceof HTMLInputElement && ['text', 'search', 'tel', 'email', 'number', 'password', 'url'].includes(next.type)) {
      try { next.select(); } catch { /* algunos tipos no permiten seleccionar */ }
    }
  }

  @HostListener('document:input', ['$event'])
  onTextInput(event: Event): void {
    const target = event.target;
    const isTextInput = target instanceof HTMLInputElement && ['text', 'search', 'tel'].includes(target.type);
    const isTextArea = target instanceof HTMLTextAreaElement;
    if (!isTextInput && !isTextArea) return;
    // Textos largos que deben respetar mayúsculas y minúsculas (cláusulas de contratos…).
    if ((target as HTMLElement).closest('[data-case="native"]')) return;

    const value = target.value;
    const upperCaseValue = value.toLocaleUpperCase('es-DO');
    if (value === upperCaseValue) return;

    target.value = upperCaseValue;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
