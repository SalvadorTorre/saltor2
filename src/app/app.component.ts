import { Component, HostListener, OnInit } from '@angular/core';
import { AppDataService } from './app-data.service';
import { ViewMode, NavigationItem, ModuleItem } from './app.models';
import { ActiveUserSession, AuthService } from './core/services/auth/auth.service';
import { DisplayPreferencesService } from './core/services/display-preferences/display-preferences.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isCheckingSession = true;
  activeUser: ActiveUserSession | null = null;
  isLogoutMenuOpen = false;

  constructor(
    public data: AppDataService,
    private readonly auth: AuthService,
    private readonly displayPreferences: DisplayPreferencesService
  ) {}

  async ngOnInit(): Promise<void> {
    this.displayPreferences.apply(this.displayPreferences.getProfile());
    this.activeUser = await this.auth.restoreSession();
    this.isCheckingSession = false;
  }

  get companyName(): string { return this.activeUser?.companyName ?? this.data.companyName; }
  get userName(): string { return this.activeUser?.fullName ?? this.data.userName; }
  get userEmail(): string { return this.activeUser?.email ?? this.data.userEmail; }
  get userInitials(): string {
    return this.userName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'US';
  }
  get todayLabel(): string { return this.data.todayLabel; }

  get expandedSections(): Record<string, boolean> { return this.data.expandedSections; }
  set expandedSections(v: Record<string, boolean>) { this.data.expandedSections = v; }

  get maintenanceLinks(): NavigationItem[] { return [
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ]; }

  get isAdmin(): boolean { return this.activeUser?.role === 'Administrador'; }

  get settingsLinks(): NavigationItem[] {
    // La base de datos ya bloquea estas escrituras a quien no es administrador;
    // aquí solo se ocultan para no mostrar pantallas que fallarían al guardar.
    const adminOnly = new Set(['Empresa', 'Usuarios']);
    return [
      { label: 'Empresa', icon: 'building' },
      { label: 'Usuarios', icon: 'users' },
      { label: 'Tipo de NCF', icon: 'tag' },
      { label: 'RNC', icon: 'id' },
      { label: 'Otros', icon: 'sliders' }
    ].filter((item) => this.isAdmin || !adminOnly.has(item.label));
  }

  get modules(): ModuleItem[] { return [
    { label: 'Facturacion', icon: 'file-text' },
    { label: 'Cotizacion', icon: 'clipboard' },
    { label: 'Caja', icon: 'wallet', key: 'caja', children: ['Apertura', 'Cierre', 'Historico'] },
    {
      label: 'Contabilidad', icon: 'calculator', key: 'accounting', children: [
        'Facturas pendientes', 'Rep. 607', 'e-NCF', 'Nota de crédito',
        'Gastos menores', 'Cuentas por cobrar', 'Rep. 606', 'Compra informal E41'
      ]
    },
    { label: 'Reporte', icon: 'chart', key: 'reports', children: ['Venta por productos', 'Rep. ventas'] }
  ]; }

  onLoggedIn(user: ActiveUserSession): void {
    this.activeUser = user;
  }

  async logout(): Promise<void> {
    this.isLogoutMenuOpen = false;
    try {
      await this.auth.signOut();
    } finally {
      // Siempre vuelve a la pantalla de acceso, aun si el servidor no responde.
      this.activeUser = null;
    }
  }

  toggleLogoutMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isLogoutMenuOpen = !this.isLogoutMenuOpen;
  }

  @HostListener('document:click')
  closeLogoutMenu(): void {
    this.isLogoutMenuOpen = false;
  }

  activeView: ViewMode = 'dashboard';
  activeSettingsLabel = 'Empresa';
  activeMaintenanceLabel = '';
  activeModuleLabel = '';
  activeModuleChild = '';
  activeTopSection = 'dashboard';

  get activeTopModule(): ModuleItem | null {
    return this.modules.find((item) => item.key === this.activeTopSection && Boolean(item.children?.length)) ?? null;
  }

  selectTopSection(section: 'dashboard' | 'maintenance' | 'settings'): void {
    this.activeTopSection = section;
    if (section === 'dashboard') {
      this.showDashboard();
    }
  }

  selectTopModule(item: ModuleItem): void {
    if (item.children?.length) {
      this.activeTopSection = item.key ?? '';
      return;
    }

    this.activeTopSection = item.key ?? '';
    this.selectStandaloneModule(item);
  }

  toggleSection(section: string): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  showDashboard(): void {
    this.activeTopSection = 'dashboard';
    this.activeView = 'dashboard';
    this.activeModuleLabel = '';
    this.activeModuleChild = '';
  }

  selectModuleChild(module: ModuleItem, child: string): void {
    this.activeModuleLabel = module.label;
    this.activeModuleChild = child;
    if (module.label === 'Facturacion' && child === 'Nueva Factura') {
      this.activeView = 'invoice_new';
      return;
    }
    if (module.label === 'Facturacion' && child === 'Historial') {
      this.activeView = 'invoice_history';
      return;
    }
    if (module.label === 'Facturacion' && child === 'Consulta de Facturas') {
      this.activeView = 'invoice_consultation';
      return;
    }
    if (module.label === 'Caja' && child === 'Apertura') {
      this.activeView = 'cash_opening';
      return;
    }
    if (module.label === 'Caja' && child === 'Cierre') {
      this.activeView = 'cash_closing';
      return;
    }
    if (module.label === 'Caja' && child === 'Historico') {
      this.activeView = 'cash_movements';
      return;
    }
    if (module.label === 'Reporte' && child === 'Venta por productos') {
      this.activeView = 'report';
      return;
    }
    if (module.label === 'Reporte' && child === 'Rep. ventas') {
      this.activeView = 'report_invoices';
      return;
    }
    if (module.label === 'Contabilidad') {
      if (child === 'e-NCF') {
        this.activeView = 'ncf';
        return;
      }
      this.activeView = 'accounting';
    }
  }

  openInvoiceFromQuotation(): void {
    this.activeModuleLabel = 'Facturacion';
    this.activeModuleChild = 'Nueva Factura';
    this.activeView = 'invoice_new';
  }

  selectStandaloneModule(item: ModuleItem): void {
    this.activeModuleLabel = item.label;
    this.activeModuleChild = '';
    if (item.label === 'Facturacion') { this.activeView = 'invoice_new'; return; }
    if (item.label === 'Cotizacion') { this.activeView = 'quotation'; return; }
    if (item.label === 'Contabilidad') { this.activeView = 'accounting'; return; }
    if (item.label === 'Reporte') { this.activeView = 'report'; }
  }

  selectMaintenanceItem(item: NavigationItem): void {
    this.activeMaintenanceLabel = item.label;
    this.activeSettingsLabel = '';
    this.activeModuleLabel = '';
    this.activeModuleChild = '';
    if (item.label === 'Clientes') { this.activeView = 'clients'; return; }
    if (item.label === 'Suplidores') { this.activeView = 'suppliers'; }
  }

  selectInventoryItem(item: 'Productos' | 'Entrada de producto'): void {
    this.activeMaintenanceLabel = item;
    this.activeSettingsLabel = '';
    this.activeModuleLabel = '';
    this.activeModuleChild = '';
    this.activeView = item === 'Productos' ? 'products' : 'product_entries';
  }

  selectSettingsItem(item: NavigationItem): void {
    this.activeSettingsLabel = item.label;
    this.activeMaintenanceLabel = '';
    this.activeModuleLabel = '';
    this.activeModuleChild = '';
    if (item.label === 'Empresa') { this.activeView = 'company'; return; }
    if (item.label === 'Usuarios') { this.activeView = 'users'; return; }
    if (item.label === 'NCF') { this.activeView = 'ncf'; return; }
    if (item.label === 'Tipo de NCF') { this.activeView = 'ncf_type'; return; }
    if (item.label === 'RNC') { this.activeView = 'rnc'; return; }
    if (item.label === 'Otros') { this.activeView = 'settings_other'; }
  }

  isSettingsActive(label: string): boolean {
    const settingsViews: Record<string, ViewMode> = {
      Empresa: 'company', Usuarios: 'users', NCF: 'ncf', 'Tipo de NCF': 'ncf_type', RNC: 'rnc', Otros: 'settings_other'
    };
    return this.activeSettingsLabel === label && this.activeView === settingsViews[label];
  }

  isStandaloneModuleActive(item: ModuleItem): boolean {
    const moduleViews: Record<string, ViewMode> = {
      Facturacion: 'invoice_new', Cotizacion: 'quotation', Contabilidad: 'accounting', Reporte: 'report'
    };
    return this.activeModuleLabel === item.label && this.activeView === moduleViews[item.label];
  }

  @HostListener('window:resize', ['$event'])
  onResize(_event: Event): void {
  }

  @HostListener('document:input', ['$event'])
  onTextInput(event: Event): void {
    const target = event.target;
    const isTextInput = target instanceof HTMLInputElement && ['text', 'search', 'tel'].includes(target.type);
    const isTextArea = target instanceof HTMLTextAreaElement;
    if (!isTextInput && !isTextArea) return;

    const value = target.value;
    const upperCaseValue = value.toLocaleUpperCase('es-DO');
    if (value === upperCaseValue) return;

    target.value = upperCaseValue;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
