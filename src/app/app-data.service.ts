import { Injectable } from '@angular/core';
import {
  Company, UserRecord, NcfCompany, NcfSequence, NcfType, RncRecord, ProductRecord, ClientRecord, SupplierRecord,
  InvoiceFormModel, InvoiceLine, ViewMode, NavigationItem, ModuleItem
} from './app.models';

@Injectable({ providedIn: 'root' })
export class AppDataService {
  readonly companyName = 'Empresa Demo SRL';
  readonly userName = 'Admin Usuario';
  readonly userEmail = 'admin@sistema.com';
  readonly todayLabel = new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'full',
    timeZone: 'America/Santo_Domingo'
  }).format(new Date());

  readonly ncfTypes = [
    '31 - Factura de Credito Fiscal Electronica',
    '32 - Factura de Consumo Electronica',
    '33 - Nota de Debito Electronica',
    '34 - Nota de Credito Electronica',
    '41 - Comprobante Electronico de Compras',
    '43 - Comprobante Electronico para Gastos Menores',
    '44 - Comprobante Electronico para Regimenes Especiales',
    '45 - Comprobante Electronico Gubernamental',
    '46 - Comprobante Electronico para Exportaciones',
    '47 - Comprobante Electronico para Pagos al Exterior'
  ];

  readonly navDashboard: NavigationItem = { label: 'Dashboard', icon: '#' };

  readonly navModules: ModuleItem[] = [
    { label: 'Facturacion', icon: '#', children: ['Nueva Factura', 'Historial', 'Cotizaciones'] },
    { label: 'Inventario', icon: '#', key: 'products', children: ['Productos'] },
    { label: 'Contactos', icon: '#', children: ['Clientes', 'Suplidores'] },
    { label: 'Caja', icon: '#', children: ['Apertura', 'Cierre', 'Movimientos'] },
    { label: 'e-NCF', icon: '#', key: 'ncf', children: ['Empresas', 'Secuencias'] },
    { label: 'Contabilidad', icon: '#', key: 'accounting', children: ['Mayores y auxiliares'] },
    { label: 'Reportes', icon: '#', key: 'report', children: ['Ver reportes'] }
  ];

  readonly navSettings: ModuleItem[] = [
    { label: 'Empresas', icon: '#', key: 'company', children: ['Sucursales y Datos'] },
    { label: 'Usuarios', icon: '#', key: 'users', children: ['Accesos y Roles'] },
    { label: 'RNC', icon: '#', key: 'rnc', children: ['Directorio DGII'] },
    { label: 'Otros', icon: '#', key: 'settings_other', children: ['Preferencias'] }
  ];

  nextCompanyId = 2;
  companies: Company[] = [
    {
      id: 1,
      tradeName: 'TechSolutions RD',
      legalName: 'TechSolutions RD, SRL',
      rnc: '13098765432',
      email: 'contacto@techsolutions.do',
      phone: '809-555-1234',
      city: 'Santo Domingo',
      website: 'https://techsolutions.do',
      address: 'Av. John F. Kennedy, Esquina Juan Ulises Garcia, Torre IBM, Piso 6',
      category: 'Tecnologia',
      status: 'Activa',
      branchCount: 2,
      lastUpdate: '2026-04-01'
    }
  ];

  nextUserId = 4;
  users: UserRecord[] = [
    {
      id: 1, firstName: 'Admin', lastName: 'Usuario', username: 'ADMIN', authUserId: null, email: 'admin@sistema.com', phone: '809-555-0101',
      companyId: 1, branch: 'Sede Central', role: 'Super Usuario', status: 'Activo',
      fullName: 'Admin Usuario', avatar: '', lastUpdate: '2026-04-10 09:30 AM'
    },
    {
      id: 2, firstName: 'Maria', lastName: 'Perez', username: 'MPEREZ', authUserId: null, email: 'maria@sistema.com', phone: '809-555-0202',
      companyId: 1, branch: 'Sede Central', role: 'Administrador', status: 'Activo',
      fullName: 'Maria Perez', avatar: '', lastUpdate: '2026-04-09 02:15 PM'
    },
    {
      id: 3, firstName: 'Juan', lastName: 'Martinez', username: 'JMARTINEZ', authUserId: null, email: 'juan@sistema.com', phone: '809-555-0303',
      companyId: 1, branch: 'Sucursal Santiago', role: 'Cajero', status: 'Inactivo',
      fullName: 'Juan Martinez', avatar: '', lastUpdate: '2026-03-28 11:05 AM'
    }
  ];

  nextNcfCompanyId = 5;
  ncfCompanies: NcfCompany[] = [
    {
      id: 1, rnc: '101234567', legalName: 'Comercial ABC, SRL', tradeName: 'Comercial ABC',
      address: 'Av. 27 de Febrero 123, Santo Domingo', phone: '809-555-1111', email: 'contacto@abc.com',
      status: 'Activa', createdAt: '15/01/2026'
    },
    {
      id: 2, rnc: '30876543210', legalName: 'Tech Solutions RD, SRL', tradeName: 'TechSol RD',
      address: 'Calle El Conde 45, Zona Colonial', phone: '809-555-2222', email: 'ventas@techsol.com',
      status: 'Activa', createdAt: '20/01/2026'
    },
    {
      id: 3, rnc: '40123987654', legalName: 'Distribuidora ZYX, CxA', tradeName: 'D. ZYX',
      address: 'Av. John F. Kennedy KM 7.5', phone: '809-555-3333', email: 'info@zyx.com',
      status: 'Inactiva', createdAt: '05/02/2026'
    },
    {
      id: 4, rnc: '50765432109', legalName: 'Servicios Generales Omega, SAS', tradeName: 'Omega SAS',
      address: 'Santiago de los Caballeros', phone: '809-555-4444', email: 'admin@omega.com',
      status: 'Activa', createdAt: '10/03/2026'
    }
  ];

  nextNcfSequenceId = 6;
  ncfSequences: NcfSequence[] = [
    {
      id: 1, companyId: 1, ncfType: '01 - Credito Fiscal', series: 'E31',
      rangeStart: 'E3100000001', rangeEnd: 'E3100000500', authorizedAt: '01/01/2026', expiresAt: '30/12/2026',
      used: 124, total: 500, status: 'Activa', alert: false, alertPercent: 80
    },
    {
      id: 2, companyId: 1, ncfType: '02 - Consumo', series: 'E32',
      rangeStart: 'E3200000001', rangeEnd: 'E3200001000', authorizedAt: '01/01/2026', expiresAt: '30/12/2026',
      used: 849, total: 1000, status: 'Activa', alert: true, alertPercent: 80
    },
    {
      id: 3, companyId: 2, ncfType: '01 - Credito Fiscal', series: 'E41',
      rangeStart: 'E4100000001', rangeEnd: 'E4100000300', authorizedAt: '15/01/2026', expiresAt: '15/12/2026',
      used: 300, total: 300, status: 'Agotada', alert: true, alertPercent: 80
    },
    {
      id: 4, companyId: 3, ncfType: '04 - Nota de Credito', series: 'B11',
      rangeStart: 'B1100000001', rangeEnd: 'B1100000200', authorizedAt: '01/02/2025', expiresAt: '01/02/2026',
      used: 88, total: 200, status: 'Vencida', alert: false, alertPercent: 80
    },
    {
      id: 5, companyId: 2, ncfType: '14 - Regimen Especial', series: 'A12',
      rangeStart: 'A1200000001', rangeEnd: 'A1200000400', authorizedAt: '01/03/2026', expiresAt: '01/03/2027',
      used: 120, total: 400, status: 'Activa', alert: false, alertPercent: 80
    }
  ];

  nextNcfTypeId = 11;
  ncfTypeList: NcfType[] = [
    { id: 1, code: '31', type: 1, series: 'E31', name: 'Factura de Credito Fiscal Electronica', description: 'Comprobante electronico para operaciones gravadas con derecho a credito ITBIS.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 2, code: '32', type: 1, series: 'E32', name: 'Factura de Consumo Electronica', description: 'Comprobante electronico para consumidores finales.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 3, code: '33', type: null, series: 'E33', name: 'Nota de Debito Electronica', description: 'Documento electronico para recuperar costos o gastos posteriores a una factura.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 4, code: '34', type: null, series: 'E34', name: 'Nota de Credito Electronica', description: 'Documento electronico para anular, devolver, descontar o corregir una factura.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 5, code: '41', type: null, series: 'E41', name: 'Comprobante Electronico de Compras', description: 'Comprobante emitido por compras a personas no registradas como contribuyentes.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 6, code: '43', type: null, series: 'E43', name: 'Comprobante Electronico para Gastos Menores', description: 'Comprobante para sustentar gastos menores relacionados al trabajo.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 7, code: '44', type: 1, series: 'E44', name: 'Comprobante Electronico para Regimenes Especiales', description: 'Comprobante para transferencias o servicios exentos bajo regimenes especiales.', taxRate: 0, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 8, code: '45', type: 1, series: 'E45', name: 'Comprobante Electronico Gubernamental', description: 'Comprobante emitido a instituciones gubernamentales.', taxRate: 18, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 9, code: '46', type: 1, series: 'E46', name: 'Comprobante Electronico para Exportaciones', description: 'Comprobante para operaciones de exportacion de bienes y servicios.', taxRate: 0, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' },
    { id: 10, code: '47', type: null, series: 'E47', name: 'Comprobante Electronico para Pagos al Exterior', description: 'Comprobante para sustentar pagos realizados al exterior.', taxRate: 0, isElectronic: true, status: 'Activa', createdAt: '15/01/2026' }
  ];

  nextRncRecordId = 7;
  rncRecords: RncRecord[] = [
    {
      id: 1, rnc: '13098765432', legalName: 'TechSolutions RD, SRL', tradeName: 'TechSolutions RD',
      category: 'Contribuyente Normal', address: 'Av. John F. Kennedy, Torre IBM, Piso 6',
      phone: '809-555-1234', email: 'contacto@techsolutions.do',
      dgiiStatus: 'Activo', syncStatus: 'Sincronizado', lastCheck: '13/04/2026 09:15 AM'
    },
    {
      id: 2, rnc: '101234567', legalName: 'Comercial ABC, SRL', tradeName: 'Comercial ABC',
      category: 'Contribuyente Normal', address: 'Av. 27 de Febrero 123',
      phone: '809-555-1111', email: 'contacto@abc.com',
      dgiiStatus: 'Activo', syncStatus: 'Sincronizado', lastCheck: '13/04/2026 09:15 AM'
    },
    {
      id: 3, rnc: '40123987654', legalName: 'Distribuidora ZYX, CxA', tradeName: 'Distribuidora ZYX',
      category: 'Contribuyente Especial', address: 'Av. John F. Kennedy KM 7.5',
      phone: '809-555-3333', email: 'info@zyx.com',
      dgiiStatus: 'Activo', syncStatus: 'Pendiente', lastCheck: '01/04/2026 10:22 AM'
    },
    {
      id: 4, rnc: '80123456789', legalName: 'Servicios Globales SAS', tradeName: 'ServiGlobal',
      category: 'Régimen de Propósito Específico', address: 'Calle Las Mercedes 45, Ens. Quisqueya',
      phone: '809-555-9988', email: 'servicios@serviglob.com',
      dgiiStatus: 'Activo', syncStatus: 'Sincronizado', lastCheck: '12/04/2026 11:00 AM'
    },
    {
      id: 5, rnc: '90654321098', legalName: 'Nueva Marca Empresarial, SRL', tradeName: 'NME',
      category: 'Contribuyente Normal', address: 'Ens. Serralles, Calle 3, Casa 17',
      phone: '809-555-7766', email: 'nme@correo.do',
      dgiiStatus: 'Pendiente', syncStatus: 'Pendiente', lastCheck: 'Sin verificar'
    },
    {
      id: 6, rnc: '50765432109', legalName: 'Soluciones Digitales, SRL', tradeName: 'SolDig RD',
      category: 'Contribuyente Normal', address: 'Parque Industrial de Santiago, Nave 12',
      phone: '809-555-8877', email: 'admin@solDig.com',
      dgiiStatus: 'Suspendido', syncStatus: 'Error', lastCheck: '13/04/2026 11:10 AM'
    }
  ];

  nextProductId = 4;
  products: ProductRecord[] = [
    {
      id: 1, code: 'PROD-001', description: 'Laptop HP Pavilion 15', unit: 'Unidad',
      category: 'Electronica', location: 'Almacen A', brand: 'HP', type: 'Equipo', size: '15 pulgadas',
      stock: 25, minimumStock: 5, cost: 520, salePrice: 650, minimumPrice: 600,
      wholesalePrice: 620, minimumSaleQuantity: 1, minimumWholesaleQuantity: 3, replacementCode: 'HP-15-2026',
      exemptItbis: false, taxValue: 18, status: 'Activo'
    },
    {
      id: 2, code: 'PROD-002', description: 'Mouse Logitech MX Master 3', unit: 'Unidad',
      category: 'Electronica', location: 'Estante 1', brand: 'Logitech', type: 'Accesorio', size: 'Estandar',
      stock: 50, minimumStock: 10, cost: 60, salePrice: 85, minimumPrice: 78,
      wholesalePrice: 74, minimumSaleQuantity: 1, minimumWholesaleQuantity: 5, replacementCode: 'LOG-MX3',
      exemptItbis: false, taxValue: 18, status: 'Activo'
    },
    {
      id: 3, code: 'PROD-003', description: 'Teclado Mecanico RGB', unit: 'Unidad',
      category: 'Electronica', location: 'Estante 1', brand: 'Redragon', type: 'Accesorio', size: 'Full Size',
      stock: 3, minimumStock: 5, cost: 45, salePrice: 72, minimumPrice: 65,
      wholesalePrice: 63, minimumSaleQuantity: 1, minimumWholesaleQuantity: 4, replacementCode: 'RED-RGB-01',
      exemptItbis: false, taxValue: 18, status: 'Agotado'
    }
  ];

  nextClientId = 6;
  clients: ClientRecord[] = [
    {
      id: 1, code: 'CLI-0001', fullName: 'Juan Carlos Perez', companyName: '',
      documentType: 'Cedula', documentNumber: '40212345678', phone: '809-555-1010',
      email: 'juan.perez@correo.com', address: 'Calle A, Casa 10, Ens. Quisqueya', city: 'Santo Domingo',
      category: 'Contado', creditLimit: 50000, balance: 0, status: 'Activo', lastPurchase: '10/04/2026'
    },
    {
      id: 2, code: 'CLI-0002', fullName: 'Comercial ABC, SRL', companyName: 'Comercial ABC, SRL',
      documentType: 'RNC', documentNumber: '101234567', phone: '809-555-2020',
      email: 'ventas@abc.com', address: 'Av. 27 de Febrero 123', city: 'Santo Domingo',
      category: 'Credito', creditLimit: 250000, balance: 45230, status: 'Activo', lastPurchase: '12/04/2026'
    },
    {
      id: 3, code: 'CLI-0003', fullName: 'Maria Gonzalez Diaz', companyName: '',
      documentType: 'Cedula', documentNumber: '40287654321', phone: '809-555-3030',
      email: 'maria.g@correo.com', address: 'Santiago, Calle B, No. 45', city: 'Santiago',
      category: 'Contado', creditLimit: 30000, balance: 12400, status: 'Activo', lastPurchase: '05/04/2026'
    },
    {
      id: 4, code: 'CLI-0004', fullName: 'Soluciones Globales SAS', companyName: 'Soluciones Globales SAS',
      documentType: 'RNC', documentNumber: '80123456789', phone: '809-555-4040',
      email: 'contacto@solglobal.com', address: 'Calle Las Mercedes 45', city: 'Santo Domingo',
      category: 'Credito', creditLimit: 1000000, balance: 320150, status: 'Activo', lastPurchase: '13/04/2026'
    },
    {
      id: 5, code: 'CLI-0005', fullName: 'Jose Rodriguez', companyName: '',
      documentType: 'Pasaporte', documentNumber: 'P12345678', phone: '809-555-5050',
      email: 'jose.r@extranjero.com', address: 'La Romana', city: 'La Romana',
      category: 'Contado', creditLimit: 0, balance: 0, status: 'Inactivo', lastPurchase: '15/03/2026'
    }
  ];

  nextSupplierId = 6;
  suppliers: SupplierRecord[] = [
    {
      id: 1, code: 'SUP-0001', companyName: 'TecnoImport RD, SRL', contactName: 'Carlos Diaz',
      documentType: 'RNC', documentNumber: '20123456789', phone: '809-555-6001',
      email: 'compras@tecnoimport.do', address: 'Zona Franca Industrial, Nave 3', city: 'Santiago',
      category: 'Importador', paymentTerms: 'Net 30 dias', balance: 125500, status: 'Activo',
      lastOrder: '11/04/2026'
    },
    {
      id: 2, code: 'SUP-0002', companyName: 'Distribuidora Local, CxA', contactName: 'Ana Martinez',
      documentType: 'RNC', documentNumber: '40123987654', phone: '809-555-6002',
      email: 'pedidos@distlocal.do', address: 'Av. John F. Kennedy KM 7.5', city: 'Santo Domingo',
      category: 'Local', paymentTerms: 'Contado / Net 15', balance: 45200, status: 'Activo',
      lastOrder: '12/04/2026'
    },
    {
      id: 3, code: 'SUP-0003', companyName: 'Servicios TI Avanzados SAS', contactName: 'Luis Sanchez',
      documentType: 'RNC', documentNumber: '50765432109', phone: '809-555-6003',
      email: 'soporte@ti-avanzado.do', address: 'Calle El Conde 45', city: 'Santo Domingo',
      category: 'Servicios', paymentTerms: 'Net 15 dias', balance: 15000, status: 'Inactivo',
      lastOrder: '28/03/2026'
    },
    {
      id: 4, code: 'SUP-0004', companyName: 'ElectroParts Corp.', contactName: 'Jennifer Lopez',
      documentType: 'Cedula', documentNumber: '00112345670', phone: '809-555-6004',
      email: 'ventas@electroparts.do', address: 'Ens. Serralles, Calle 3', city: 'Santo Domingo',
      category: 'Local', paymentTerms: 'Contado', balance: 0, status: 'Activo',
      lastOrder: '08/04/2026'
    },
    {
      id: 5, code: 'SUP-0005', companyName: 'Global Electronics S.A.', contactName: 'Miguel Torres',
      documentType: 'Pasaporte', documentNumber: 'A123456789', phone: '+1-305-555-9000',
      email: 'export@globalelec.com', address: 'Miami, Florida, USA', city: 'Extranjero',
      category: 'Importador', paymentTerms: 'T/T 50% anticipo', balance: 280000, status: 'Suspendido',
      lastOrder: '20/02/2026'
    }
  ];

  invoiceCounter = 1;

  activeView: ViewMode = 'dashboard';
  activeModuleLabel = '';
  activeModuleChild = '';
  expandedSections: Record<string, boolean> = {
    dashboard: true, company: false, users: false, ncf: false, rnc: false, settings_other: false,
    products: false, clients: false, suppliers: false, invoice_new: false, invoice_history: false,
    quotation: false, cash_opening: false, cash_closing: false, cash_movements: false,
    accounting: false, report: false
  };
}
