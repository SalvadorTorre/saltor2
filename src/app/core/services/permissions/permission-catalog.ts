/**
 * Catálogo de accesos: módulos del sistema, sus pantallas y sus acciones.
 * Los accesos por rol se calculan aquí; el administrador puede personalizarlos
 * por usuario (Configuración › Usuarios › Accesos) y eso se guarda en
 * myappdb.usuario_permisos.
 */

export interface PermissionScreen { path: string; label: string; }
export interface PermissionAction { key: string; label: string; }
export interface PermissionModule {
  key: string;
  label: string;
  /** Módulo contratado por la empresa que habilita esta sección (empresa_modulos). */
  companyModule: string;
  screens: PermissionScreen[];
  actions: PermissionAction[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'facturacion', label: 'Facturación', companyModule: 'facturacion',
    screens: [{ path: '/facturacion', label: 'Facturación' }],
    actions: [
      { key: 'facturas.crear', label: 'Crear facturas' },
      { key: 'facturas.editar', label: 'Editar facturas' },
      { key: 'facturas.editar_impresa', label: 'Editar facturas ya impresas' },
      { key: 'facturas.anular', label: 'Anular facturas' }
    ]
  },
  {
    key: 'cotizacion', label: 'Cotización', companyModule: 'cotizacion',
    screens: [{ path: '/cotizaciones', label: 'Cotizaciones' }],
    actions: [
      { key: 'cotizaciones.crear', label: 'Crear cotizaciones' },
      { key: 'cotizaciones.editar', label: 'Editar cotizaciones' },
      { key: 'cotizaciones.convertir', label: 'Convertir en orden de venta' }
    ]
  },
  {
    key: 'transacciones', label: 'Transacciones', companyModule: 'transacciones',
    screens: [
      { path: '/transacciones/orden-venta', label: 'Orden de venta' },
      { path: '/transacciones/facturacion', label: 'Facturación' },
      { path: '/transacciones/cotizacion', label: 'Cotización' },
      { path: '/transacciones/conduce', label: 'Conduce' }
    ],
    actions: [
      { key: 'ordenes.crear', label: 'Crear órdenes de venta' },
      { key: 'ordenes.editar', label: 'Editar órdenes de venta' },
      { key: 'ordenes.eliminar', label: 'Borrar órdenes de venta' },
      { key: 'conduces.crear', label: 'Crear conduces' },
      { key: 'conduces.entregar', label: 'Marcar conduces entregados' },
      { key: 'conduces.anular', label: 'Anular conduces' }
    ]
  },
  {
    key: 'caja', label: 'Caja', companyModule: 'caja',
    screens: [
      { path: '/caja/cobro', label: 'Cobro de facturas' },
      { path: '/caja/facturar-ordenes', label: 'Facturar órdenes' },
      { path: '/caja/apertura', label: 'Apertura' },
      { path: '/caja/cierre', label: 'Cierre' },
      { path: '/caja/historico', label: 'Histórico' }
    ],
    actions: []
  },
  {
    key: 'contabilidad', label: 'Contabilidad', companyModule: 'contabilidad',
    screens: [
      { path: '/contabilidad/panel-fiscal', label: 'Panel fiscal' },
      { path: '/contabilidad/rep-607', label: 'Rep. 607' },
      { path: '/contabilidad/rep-606', label: 'Rep. 606' },
      { path: '/contabilidad/anulados', label: 'Anulados (608)' },
      { path: '/contabilidad/e-ncf', label: 'e-NCF' },
      { path: '/contabilidad/facturas-pendientes', label: 'Facturas pendientes' },
      { path: '/contabilidad/notas-credito', label: 'Nota de crédito' },
      { path: '/contabilidad/gastos-menores', label: 'Gastos menores' },
      { path: '/contabilidad/cuentas-por-cobrar', label: 'Cuentas por cobrar' },
      { path: '/contabilidad/compras-e41', label: 'Compra informal E41' }
    ],
    actions: []
  },
  {
    key: 'reportes', label: 'Reportes', companyModule: 'reportes',
    screens: [
      { path: '/reportes/productos', label: 'Venta por productos' },
      { path: '/reportes/ventas', label: 'Ventas' },
      { path: '/reportes/analisis', label: 'Análisis de ventas' }
    ],
    actions: []
  },
  {
    key: 'mantenimiento', label: 'Mantenimiento', companyModule: 'mantenimiento',
    screens: [
      { path: '/mantenimiento/clientes', label: 'Clientes' },
      { path: '/mantenimiento/suplidores', label: 'Suplidores' },
      { path: '/mantenimiento/productos', label: 'Productos' },
      { path: '/mantenimiento/entrada-productos', label: 'Entrada de producto' },
      { path: '/mantenimiento/kardex', label: 'Kardex y ajustes' }
    ],
    actions: [
      { key: 'clientes.crear', label: 'Crear clientes' },
      { key: 'clientes.editar', label: 'Editar clientes' },
      { key: 'clientes.eliminar', label: 'Borrar clientes' },
      { key: 'suplidores.crear', label: 'Crear suplidores' },
      { key: 'suplidores.editar', label: 'Editar suplidores' },
      { key: 'suplidores.eliminar', label: 'Borrar suplidores' },
      { key: 'productos.crear', label: 'Crear productos' },
      { key: 'productos.editar', label: 'Editar productos' },
      { key: 'productos.eliminar', label: 'Borrar productos' }
    ]
  },
  {
    key: 'configuracion', label: 'Configuración', companyModule: 'configuracion',
    screens: [
      { path: '/configuracion/empresa', label: 'Empresa (solo administrador)' },
      { path: '/configuracion/usuarios', label: 'Usuarios (solo administrador)' },
      { path: '/configuracion/bitacora', label: 'Bitácora (solo administrador)' },
      { path: '/configuracion/firma-digital', label: 'Firma digital DGII' },
      { path: '/configuracion/otros', label: 'Otros ajustes' },
      { path: '/configuracion/soporte', label: 'Soporte' }
    ],
    actions: []
  }
];

/** Pantallas que solo abre el administrador (la base de datos también lo exige). */
export const ADMIN_ONLY_SCREENS = ['/configuracion/empresa', '/configuracion/usuarios', '/configuracion/bitacora'];

export const ALL_SCREENS = PERMISSION_MODULES.flatMap((m) => m.screens.map((s) => s.path));
export const ALL_ACTIONS = PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => a.key));

const screensOf = (...modules: string[]) => PERMISSION_MODULES.filter((m) => modules.includes(m.key)).flatMap((m) => m.screens.map((s) => s.path));
const actionsOf = (...modules: string[]) => PERMISSION_MODULES.filter((m) => modules.includes(m.key)).flatMap((m) => m.actions.map((a) => a.key));

/** Accesos que trae cada rol mientras el administrador no los personalice. */
export function roleDefaults(role: string): { screens: string[]; actions: string[] } {
  switch (role) {
    case 'Administrador':
      return { screens: [...ALL_SCREENS], actions: [...ALL_ACTIONS] };
    case 'Supervisor':
      return { screens: ALL_SCREENS.filter((s) => !ADMIN_ONLY_SCREENS.includes(s)), actions: [...ALL_ACTIONS] };
    case 'Cajero':
      return {
        screens: [...screensOf('facturacion', 'caja'), '/transacciones/facturacion', '/mantenimiento/clientes'],
        actions: ['facturas.crear', 'clientes.crear', 'clientes.editar']
      };
    case 'Contabilidad':
      return { screens: screensOf('contabilidad', 'reportes'), actions: actionsOf('contabilidad', 'reportes') };
    case 'Consulta':
    default:
      return { screens: [...screensOf('reportes'), '/mantenimiento/productos'], actions: [] };
  }
}

/** Ruta del catálogo que corresponde a una URL (sin parámetros ni subrutas). */
export function screenForUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return ALL_SCREENS.find((screen) => path === screen || path.startsWith(`${screen}/`)) ?? null;
}
