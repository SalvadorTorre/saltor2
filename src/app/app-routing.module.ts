import { Injectable, NgModule, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CanMatchFn, Router, RouterModule, RouterStateSnapshot, Routes, TitleStrategy } from '@angular/router';
import { AuthService } from './core/services/auth/auth.service';
import { CompaniesService } from './core/services/companies/companies.service';
import { CompanyModule, CompanyModulesService } from './core/services/company-modules/company-modules.service';

/**
 * Pantallas que solo ve el administrador.  La base de datos ya rechaza sus
 * escrituras a otros roles; la guarda evita abrirlas por URL.  Espera a que la
 * sesión se restaure para que recargar la página no expulse al administrador.
 */
export const adminOnly: CanMatchFn = async () => {
  // inject() solo funciona antes del primer await.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restoreSession();
  return auth.isAdmin || router.createUrlTree(['/inicio']);
};

/** Pantallas de la plataforma: solo los dueños del sistema (la base de datos también lo exige). */
export const platformOwnerOnly: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const companies = inject(CompaniesService);
  const router = inject(Router);
  await auth.restoreSession();
  return (await companies.isPlatformOwner()) || router.createUrlTree(['/inicio']);
};

/** Restringe las pantallas contratadas por la empresa activa, incluso si se escribe la URL. */
export const companyModuleOnly = (module: CompanyModule): CanMatchFn => async () => {
  const auth = inject(AuthService);
  const modules = inject(CompanyModulesService);
  const router = inject(Router);
  const session = await auth.restoreSession();
  if (!session) return router.createUrlTree(['/inicio']);
  try {
    return (await modules.getActiveModules(session.companyId)).includes(module) || router.createUrlTree(['/inicio']);
  } catch {
    return router.createUrlTree(['/inicio']);
  }
};

// Cada pantalla se descarga solo cuando se abre (loadComponent), en lugar de
// venir toda en el paquete inicial.  `data` llega a los @Input del componente.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: 'inicio', title: 'Inicio', loadComponent: () => import('./dashboard/dashboard-page/dashboard-page.component').then((m) => m.DashboardPageComponent) },

  { path: 'facturacion', title: 'Facturación', canMatch: [companyModuleOnly('facturacion')], loadComponent: () => import('./invoices/new-page/new-page.component').then((m) => m.InvoiceNewPageComponent) },
  { path: 'cotizaciones', title: 'Cotizaciones', canMatch: [companyModuleOnly('cotizacion')], loadComponent: () => import('./quotations/quotation-page/quotation-page.component').then((m) => m.QuotationPageComponent) },

  {
    path: 'transacciones',
    canMatch: [companyModuleOnly('transacciones')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'orden-venta' },
      { path: 'orden-venta', title: 'Orden de venta', data: { saleOrder: true }, loadComponent: () => import('./invoices/new-page/new-page.component').then((m) => m.InvoiceNewPageComponent) },
      { path: 'facturacion', title: 'Facturación', loadComponent: () => import('./invoices/new-page/new-page.component').then((m) => m.InvoiceNewPageComponent) },
      { path: 'cotizacion', title: 'Cotización', data: { transactionQuotation: true }, loadComponent: () => import('./quotations/quotation-page/quotation-page.component').then((m) => m.QuotationPageComponent) },
      { path: 'conduce', title: 'Conduce', loadComponent: () => import('./transactions/delivery-note-page/delivery-note-page.component').then((m) => m.DeliveryNotePageComponent) }
    ]
  },

  {
    path: 'caja',
    canMatch: [companyModuleOnly('caja')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'apertura' },
      { path: 'cobro', title: 'Cobro de facturas', loadComponent: () => import('./cash/collection-page/cash-collection-page.component').then((m) => m.CashCollectionPageComponent) },
      { path: 'apertura', title: 'Apertura de caja', loadComponent: () => import('./cash/opening-page/cash-opening-page.component').then((m) => m.CashOpeningPageComponent) },
      { path: 'cierre', title: 'Cierre de caja', loadComponent: () => import('./cash/closing-page/cash-closing-page.component').then((m) => m.CashClosingPageComponent) },
      { path: 'historico', title: 'Histórico de caja', loadComponent: () => import('./cash/movements-page/cash-movements-page.component').then((m) => m.CashMovementsPageComponent) }
    ]
  },

  {
    path: 'contabilidad',
    canMatch: [companyModuleOnly('contabilidad')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'rep-607' },
      { path: 'panel-fiscal', title: 'Panel fiscal', loadComponent: () => import('./accounting/fiscal-panel-page/fiscal-panel-page.component').then((m) => m.FiscalPanelPageComponent) },
      { path: 'cuentas-por-cobrar', title: 'Cuentas por cobrar', loadComponent: () => import('./receivables/receivables-page/receivables-page.component').then((m) => m.ReceivablesPageComponent) },
      { path: 'anulados', title: 'Comprobantes anulados', loadComponent: () => import('./accounting/cancelled-page/cancelled-page.component').then((m) => m.CancelledInvoicesPageComponent) },
      { path: 'e-ncf', title: 'e-NCF', loadComponent: () => import('./ncf/ncf-page/ncf-page.component').then((m) => m.NcfPageComponent) },
      ...([
        ['facturas-pendientes', 'Facturas pendientes'],
        ['rep-607', 'Rep. 607'],
        ['notas-credito', 'Nota de crédito'],
        ['gastos-menores', 'Gastos menores'],
        ['rep-606', 'Rep. 606'],
        ['compras-e41', 'Compra informal E41']
      ] as const).map(([path, section]) => ({
        path,
        title: section,
        data: { section },
        loadComponent: () => import('./accounting/accounting-page/accounting-page.component').then((m) => m.AccountingPageComponent)
      }))
    ]
  },

  {
    path: 'reportes',
    canMatch: [companyModuleOnly('reportes')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'productos' },
      { path: 'productos', title: 'Venta por productos', data: { mode: 'products' }, loadComponent: () => import('./reports/report-page/report-page.component').then((m) => m.ReportPageComponent) },
      { path: 'ventas', title: 'Reporte de ventas', data: { mode: 'invoices' }, loadComponent: () => import('./reports/report-page/report-page.component').then((m) => m.ReportPageComponent) },
      { path: 'analisis', title: 'Análisis de ventas', loadComponent: () => import('./reports/analysis-page/analysis-page.component').then((m) => m.SalesAnalysisPageComponent) }
    ]
  },

  {
    path: 'mantenimiento',
    canMatch: [companyModuleOnly('mantenimiento')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'clientes' },
      { path: 'clientes', title: 'Clientes', loadComponent: () => import('./clients/clients-page/clients-page.component').then((m) => m.ClientsPageComponent) },
      { path: 'suplidores', title: 'Suplidores', loadComponent: () => import('./suppliers/suppliers-page/suppliers-page.component').then((m) => m.SuppliersPageComponent) },
      { path: 'productos', title: 'Productos', loadComponent: () => import('./products/products-page/products-page.component').then((m) => m.ProductsPageComponent) },
      { path: 'kardex', title: 'Kardex', loadComponent: () => import('./products/kardex-page/kardex-page.component').then((m) => m.KardexPageComponent) },
      { path: 'entrada-productos', title: 'Entrada de producto', loadComponent: () => import('./products/entries-page/product-entries-page.component').then((m) => m.ProductEntriesPageComponent) }
    ]
  },

  {
    path: 'configuracion',
    canMatch: [companyModuleOnly('configuracion')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tipos-ncf' },
      { path: 'empresa', title: 'Empresa', canMatch: [adminOnly], loadComponent: () => import('./company/company-page/company-page.component').then((m) => m.CompanyPageComponent) },
      { path: 'bitacora', title: 'Bitácora', canMatch: [adminOnly], loadComponent: () => import('./audit/audit-page/audit-page.component').then((m) => m.AuditPageComponent) },
      { path: 'usuarios', title: 'Usuarios', canMatch: [adminOnly], loadComponent: () => import('./users/users-page/users-page.component').then((m) => m.UsersPageComponent) },
      { path: 'firma-digital', title: 'Firma Digital DGII', loadComponent: () => import('./settings/digital-signature-page/digital-signature-page.component').then((m) => m.DigitalSignaturePageComponent) },
      { path: 'tipos-ncf', title: 'Tipos de NCF', loadComponent: () => import('./ncf/ncf-type-page/ncf-type-page.component').then((m) => m.NcfTypePageComponent) },
      { path: 'rnc', title: 'RNC', loadComponent: () => import('./rnc/rnc-page/rnc-page.component').then((m) => m.RncPageComponent) },
      { path: 'soporte', title: 'Soporte', loadComponent: () => import('./platform/support-page/support-page.component').then((m) => m.SupportPageComponent) },
      { path: 'otros', title: 'Otros ajustes', loadComponent: () => import('./settings/other-page/other-page.component').then((m) => m.SettingsOtherPageComponent) }
    ]
  },

  {
    path: 'plataforma',
    canMatch: [platformOwnerOnly],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'empresas' },
      { path: 'empresas', title: 'Plataforma · Empresas', loadComponent: () => import('./platform/companies-page/platform-companies-page.component').then((m) => m.PlatformCompaniesPageComponent) },
      { path: 'proformas-programadas', title: 'Plataforma · Proformas programadas', loadComponent: () => import('./platform/proforma-scheduler-page/proforma-scheduler-page.component').then((m) => m.ProformaSchedulerPageComponent) },
      { path: 'pagos', title: 'Plataforma · Pagos', loadComponent: () => import('./platform/payments-page/platform-payments-page.component').then((m) => m.PlatformPaymentsPageComponent) },
      { path: 'contratos', title: 'Plataforma · Contratos', loadComponent: () => import('./platform/contracts-page/platform-contracts-page.component').then((m) => m.PlatformContractsPageComponent) },
      { path: 'instalador', title: 'Plataforma · Instalador local', loadComponent: () => import('./platform/local-installer-page/local-installer-page.component').then((m) => m.LocalInstallerPageComponent) },
      { path: 'instalaciones', title: 'Plataforma · Instalaciones', loadComponent: () => import('./platform/installations-page/platform-installations-page.component').then((m) => m.PlatformInstallationsPageComponent) },
      { path: 'salud', title: 'Plataforma · Salud', loadComponent: () => import('./platform/health-page/platform-health-page.component').then((m) => m.PlatformHealthPageComponent) },
      { path: 'soporte', title: 'Plataforma · Soporte', data: { platform: true }, loadComponent: () => import('./platform/support-page/support-page.component').then((m) => m.SupportPageComponent) },
      { path: 'avisos', title: 'Plataforma · Avisos', loadComponent: () => import('./platform/notices-page/platform-notices-page.component').then((m) => m.PlatformNoticesPageComponent) },
      { path: 'planes', title: 'Plataforma · Planes', loadComponent: () => import('./platform/plans-page/platform-plans-page.component').then((m) => m.PlatformPlansPageComponent) },
      { path: 'bitacora', title: 'Plataforma · Bitácora', data: { platform: true }, loadComponent: () => import('./audit/audit-page/audit-page.component').then((m) => m.AuditPageComponent) }
    ]
  },

  { path: '**', redirectTo: 'inicio' }
];

/** Muestra "Pantalla · SaltorSystem" en la pestaña del navegador. */
@Injectable()
class SaltorTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · SaltorSystem` : 'SaltorSystem');
  }
}

@NgModule({
  imports: [RouterModule.forRoot(routes, { bindToComponentInputs: true })],
  exports: [RouterModule],
  providers: [{ provide: TitleStrategy, useClass: SaltorTitleStrategy }]
})
export class AppRoutingModule { }
