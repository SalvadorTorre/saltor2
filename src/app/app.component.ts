import { Component, HostListener } from '@angular/core';

interface NavigationItem {
  label: string;
  icon: string;
}

interface ModuleItem extends NavigationItem {
  key?: string;
  children?: string[];
}

interface Company {
  id: number;
  tradeName: string;
  legalName: string;
  rnc: string;
  email: string;
  phone: string;
  city: string;
  website: string;
  address: string;
  category: string;
  status: 'Activa' | 'Inactiva';
  branchCount: number;
  lastUpdate: string;
}

interface UserFormModel {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: number | null;
  branch: string;
  role: string;
  status: 'Activo' | 'Inactivo';
}

interface UserRecord extends UserFormModel {
  id: number;
  fullName: string;
  avatar: string;
  lastUpdate: string;
}

interface NcfCompany {
  id: number;
  rnc: string;
  legalName: string;
  tradeName: string;
  address: string;
  phone: string;
  email: string;
  status: 'Activa' | 'Inactiva';
  createdAt: string;
}

interface NcfSequence {
  id: number;
  companyId: number;
  ncfType: string;
  series: string;
  rangeStart: string;
  rangeEnd: string;
  authorizedAt: string;
  expiresAt: string;
  used: number;
  total: number;
  status: 'Activa' | 'Agotada' | 'Vencida';
  alert: boolean;
}

interface NcfCompanyFormModel {
  rnc: string;
  legalName: string;
  tradeName: string;
  address: string;
  phone: string;
  email: string;
  status: 'Activa' | 'Inactiva';
}

interface NcfSequenceFormModel {
  companyId: number | null;
  ncfType: string;
  series: string;
  rangeStart: string;
  rangeEnd: string;
  authorizedAt: string;
  expiresAt: string;
  status: 'Activa' | 'Agotada' | 'Vencida';
}

interface RncRecord {
  id: number;
  rnc: string;
  legalName: string;
  tradeName: string;
  category: string;
  address: string;
  phone: string;
  email: string;
  dgiiStatus: 'Activo' | 'Suspendido' | 'Pendiente';
  syncStatus: 'Sincronizado' | 'Pendiente' | 'Error';
  lastCheck: string;
}

interface RncFormModel {
  rnc: string;
  legalName: string;
  tradeName: string;
  category: string;
  address: string;
  phone: string;
  email: string;
  dgiiStatus: 'Activo' | 'Suspendido' | 'Pendiente';
}

interface ProductRecord {
  id: number;
  code: string;
  description: string;
  unit: string;
  category: string;
  location: string;
  brand: string;
  type: string;
  size: string;
  stock: number;
  minimumStock: number;
  cost: number;
  salePrice: number;
  minimumPrice: number;
  wholesalePrice: number;
  minimumWholesaleQuantity: number;
  replacementCode: string;
  exemptItbis: boolean;
  taxValue: number;
  status: 'Activo' | 'Inactivo' | 'Agotado';
}

type ProductFormModel = Omit<ProductRecord, 'id'>;
interface ClientRecord {
  id: number;
  code: string;
  fullName: string;
  companyName: string;
  documentType: 'Cedula' | 'RNC' | 'Pasaporte';
  documentNumber: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  category: 'Minorista' | 'Mayorista' | 'Corporativo';
  creditLimit: number;
  balance: number;
  status: 'Activo' | 'Inactivo' | 'Bloqueado';
  lastPurchase: string;
}

type ClientFormModel = Omit<ClientRecord, 'id' | 'lastPurchase'>;
interface SupplierRecord {
  id: number;
  code: string;
  companyName: string;
  contactName: string;
  documentType: 'RNC' | 'Cedula' | 'Pasaporte';
  documentNumber: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  category: 'Local' | 'Importador' | 'Servicios';
  paymentTerms: string;
  balance: number;
  status: 'Activo' | 'Inactivo' | 'Suspendido';
  lastOrder: string;
}

type SupplierFormModel = Omit<SupplierRecord, 'id' | 'lastOrder'>;
interface InvoiceLine {
  id: number;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

interface InvoiceFormModel {
  customerId: number | null;
  invoiceDate: string;
  ncfType: string;
  paymentMethod: 'Contado' | 'Credito';
  notes: string;
}

type CompanyFormModel = Omit<Company, 'id' | 'branchCount' | 'lastUpdate'>;
type ViewMode = 'dashboard' | 'company' | 'users' | 'ncf' | 'rnc' | 'products' | 'clients' | 'suppliers' | 'invoice_new';
type CompanyEditorMode = 'create' | 'edit';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly companyName = 'Empresa Demo SRL';
  readonly userName = 'Admin Usuario';
  readonly userEmail = 'admin@sistema.com';
  readonly todayLabel = new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'full',
    timeZone: 'America/Santo_Domingo'
  }).format(new Date());

  expandedSections: Record<string, boolean> = {
    maintenance: true,
    settings: true,
    facturacion: false,
    caja: false
  };

  readonly maintenanceLinks: NavigationItem[] = [
    { label: 'Productos', icon: 'box' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ];

  readonly settingsLinks: NavigationItem[] = [
    { label: 'Empresa', icon: 'building' },
    { label: 'Usuarios', icon: 'users' },
    { label: 'NCF', icon: 'receipt' },
    { label: 'RNC', icon: 'id' },
    { label: 'Otros', icon: 'sliders' }
  ];

  readonly modules: ModuleItem[] = [
    {
      label: 'Facturacion',
      icon: 'file-text',
      key: 'facturacion',
      children: ['Nueva Factura', 'Historial']
    },
    { label: 'Cotizacion', icon: 'clipboard' },
    {
      label: 'Caja',
      icon: 'wallet',
      key: 'caja',
      children: ['Apertura', 'Cierre', 'Movimientos']
    },
    { label: 'Contabilidad', icon: 'calculator' },
    { label: 'Reporte', icon: 'chart' }
  ];

  readonly statCards = [
    { label: 'Ventas del Dia', value: '$18,450', hint: '+12.4%', tone: 'success', icon: 'sale' },
    { label: 'Ventas del Mes', value: '$286,900', hint: '+8.2%', tone: 'primary', icon: 'wallet' },
    { label: 'Productos Vendidos', value: '136', hint: '23 hoy', tone: 'emerald', icon: 'bag' },
    { label: 'Total Facturas', value: '18', hint: '5 pendientes', tone: 'sky', icon: 'file' },
    { label: 'Stock Bajo', value: '8', hint: 'Requiere revision', tone: 'danger', icon: 'alert' }
  ];

  readonly salesSeries = [
    { label: 'Lun', value: '$32K', x: 8, y: 24 },
    { label: 'Mar', value: '$74K', x: 22, y: 54 },
    { label: 'Mie', value: '$58K', x: 36, y: 40 },
    { label: 'Jue', value: '$92K', x: 50, y: 72 },
    { label: 'Vie', value: '$69K', x: 64, y: 50 },
    { label: 'Sab', value: '$81K', x: 78, y: 60 },
    { label: 'Dom', value: '$118K', x: 92, y: 88 }
  ];

  readonly topProducts = [
    { name: 'Laptop HP 15', quantity: 56, amount: '$840' },
    { name: 'Monitor Samsung 24', quantity: 42, amount: '$630' },
    { name: 'Teclado Logitech', quantity: 35, amount: '$420' },
    { name: 'Mouse Inalambrico', quantity: 50, amount: '$375' },
    { name: 'Impresora Epson', quantity: 30, amount: '$320' }
  ];

  readonly alertGroups = [
    {
      title: 'Stock Bajo',
      icon: 'alert',
      items: ['Toner HP 85A', 'Mouse Genius', 'Papel Carta Premium']
    },
    {
      title: 'Sin Movimiento',
      icon: 'box',
      items: ['Camara Web HD', 'Cable VGA', 'Base para Laptop']
    }
  ];

  readonly categories = [
    { label: 'Computadoras', percent: 32, color: '#2563eb' },
    { label: 'Accesorios', percent: 25, color: '#14b8a6' },
    { label: 'Impresion', percent: 20, color: '#f97316' },
    { label: 'Redes', percent: 15, color: '#ef4444' },
    { label: 'Oficina', percent: 8, color: '#8b5cf6' }
  ];

  readonly inventoryFlow = [
    { label: 'Entradas', value: 120, width: 62, tone: 'green' },
    { label: 'Salidas', value: 145, width: 78, tone: 'orange' },
    { label: 'Transferencias', value: 38, width: 34, tone: 'blue' }
  ];

  readonly transactions = [
    { date: '10/04/2026', invoice: '#2045', client: 'Carlos Perez', total: '$150', status: 'Pagada' },
    { date: '10/04/2026', invoice: '#2044', client: 'Ana Garcia', total: '$220', status: 'Pendiente' },
    { date: '09/04/2026', invoice: '#2043', client: 'Luis Martinez', total: '$340', status: 'Pagada' },
    { date: '09/04/2026', invoice: '#2042', client: 'Sofia Torres', total: '$85', status: 'Anulada' }
  ];

  readonly userRoleOptions = [
    'Administrador',
    'Supervisor',
    'Cajero',
    'Contabilidad',
    'Consulta'
  ];

  readonly companyBranches: Record<number, string[]> = {
    1: ['Piantini', 'Sambil', 'Megacentro', 'Santo Domingo Oeste'],
    2: ['Centro Historico', 'Los Jardines'],
    3: ['Terminal Este', 'Zona Industrial']
  };

  readonly ncfTypes = [
    '01 - Credito Fiscal',
    '02 - Consumo',
    '03 - Nota de Debito',
    '04 - Nota de Credito',
    '14 - Regimen Especial'
  ];

  activeView: ViewMode = 'company';
  activeSettingsLabel = 'Empresa';
  activeMaintenanceLabel = 'Productos';
  companyEditorMode: CompanyEditorMode = 'create';
  companyMessage = 'Formulario listo para registrar una nueva empresa.';
  userEditorMode: 'create' | 'edit' = 'create';
  ncfViewMode: 'companies' | 'sequences' = 'companies';
  ncfCompanyEditorMode: 'create' | 'edit' = 'create';
  ncfSequenceEditorMode: 'create' | 'edit' = 'create';
  rncEditorMode: 'create' | 'edit' = 'create';
  productEditorMode: 'create' | 'edit' = 'create';
  clientEditorMode: 'create' | 'edit' = 'create';
  supplierEditorMode: 'create' | 'edit' = 'create';

  companies: Company[] = [
    {
      id: 1,
      tradeName: 'Saltor Comercial',
      legalName: 'Saltor Comercial SRL',
      rnc: '132456789',
      email: 'info@saltorcomercial.com',
      phone: '(809) 555-0182',
      city: 'Santo Domingo',
      website: 'www.saltorcomercial.com',
      address: 'Av. Winston Churchill 120, Ensanche Piantini',
      category: 'Principal',
      status: 'Activa',
      branchCount: 4,
      lastUpdate: '14/04/2026 10:30 AM'
    },
    {
      id: 2,
      tradeName: 'Saltor Punto Norte',
      legalName: 'Saltor Punto Norte EIRL',
      rnc: '133789456',
      email: 'norte@saltor.com',
      phone: '(809) 555-0144',
      city: 'Santiago',
      website: 'www.saltornorte.com',
      address: 'Calle Del Sol 42, Centro Historico',
      category: 'Sucursal',
      status: 'Activa',
      branchCount: 1,
      lastUpdate: '13/04/2026 04:15 PM'
    },
    {
      id: 3,
      tradeName: 'Saltor Express',
      legalName: 'Saltor Express SRL',
      rnc: '131998877',
      email: 'express@saltor.com',
      phone: '(849) 555-0199',
      city: 'La Romana',
      website: 'www.saltorexpress.com',
      address: 'Aut. San Pedro - La Romana km 3',
      category: 'Logistica',
      status: 'Inactiva',
      branchCount: 2,
      lastUpdate: '11/04/2026 08:40 AM'
    }
  ];

  selectedCompany: Company = this.companies[0];
  companyForm: CompanyFormModel = this.createEmptyCompanyForm();
  userMessage = 'Formulario listo para registrar un nuevo usuario en el sistema.';
  userForm: UserFormModel = {
    firstName: 'Juan',
    lastName: 'Perez',
    email: 'juan.perez@empresa.com',
    phone: '+52 123 456 7890',
    companyId: null,
    branch: '',
    role: '',
    status: 'Activo'
  };
  users: UserRecord[] = [
    {
      id: 1,
      firstName: 'Juan',
      lastName: 'Perez',
      fullName: 'Juan Perez',
      email: 'juan.perez@empresa.com',
      phone: '+52 123 456 7890',
      companyId: 1,
      branch: 'Piantini',
      role: 'Administrador',
      status: 'Activo',
      avatar: 'JP',
      lastUpdate: '14/04/2026 11:20 AM'
    },
    {
      id: 2,
      firstName: 'Maria',
      lastName: 'Lopez',
      fullName: 'Maria Lopez',
      email: 'maria.lopez@saltor.com',
      phone: '+52 809 555 1482',
      companyId: 2,
      branch: 'Centro Historico',
      role: 'Supervisor',
      status: 'Activo',
      avatar: 'ML',
      lastUpdate: '13/04/2026 03:45 PM'
    },
    {
      id: 3,
      firstName: 'Carlos',
      lastName: 'Diaz',
      fullName: 'Carlos Diaz',
      email: 'carlos.diaz@saltor.com',
      phone: '+52 849 555 0191',
      companyId: 3,
      branch: 'Terminal Este',
      role: 'Consulta',
      status: 'Inactivo',
      avatar: 'CD',
      lastUpdate: '11/04/2026 09:10 AM'
    }
  ];
  selectedUser: UserRecord = this.users[0];
  ncfSearch = '';
  ncfSequenceSearch = '';
  ncfSequenceCompanyFilter = 'all';
  ncfSequenceTypeFilter = 'all';
  ncfSequenceStatusFilter = 'all';
  openNcfCompanyActionsId: number | null = null;
  ncfCompanyMessage = 'Registra empresas autorizadas para recibir secuencias de comprobantes fiscales.';
  ncfSequenceMessage = 'Asigna y controla los rangos NCF autorizados por la DGII.';
  ncfCompanies: NcfCompany[] = [
    {
      id: 1,
      rnc: '101234567',
      legalName: 'Comercial ABC, SRL',
      tradeName: 'ABC Store',
      address: 'Av. 27 de Febrero 10, Santo Domingo',
      phone: '809-555-1234',
      email: 'info@abcstore.com',
      status: 'Activa',
      createdAt: '14/01/2024'
    },
    {
      id: 2,
      rnc: '102345678',
      legalName: 'Distribuidora XYZ, SA',
      tradeName: 'XYZ Distribuciones',
      address: 'Calle Duarte 22, Santiago',
      phone: '809-555-5678',
      email: 'contacto@xyz.com',
      status: 'Activa',
      createdAt: '19/02/2024'
    },
    {
      id: 3,
      rnc: '103456789',
      legalName: 'Tech Solutions, EIRL',
      tradeName: 'TechSol',
      address: 'Ave. Las Americas km 5',
      phone: '809-555-9012',
      email: 'admin@techsol.com',
      status: 'Activa',
      createdAt: '09/03/2024'
    }
  ];
  ncfSequences: NcfSequence[] = [
    {
      id: 1,
      companyId: 1,
      ncfType: '01 - Credito Fiscal',
      series: 'E31',
      rangeStart: 'E3100000001',
      rangeEnd: 'E3100000500',
      authorizedAt: '01/01/2026',
      expiresAt: '30/12/2026',
      used: 124,
      total: 500,
      status: 'Activa',
      alert: false
    },
    {
      id: 2,
      companyId: 1,
      ncfType: '02 - Consumo',
      series: 'E32',
      rangeStart: 'E3200000001',
      rangeEnd: 'E3200001000',
      authorizedAt: '01/01/2026',
      expiresAt: '30/12/2026',
      used: 849,
      total: 1000,
      status: 'Activa',
      alert: true
    },
    {
      id: 3,
      companyId: 2,
      ncfType: '01 - Credito Fiscal',
      series: 'E41',
      rangeStart: 'E4100000001',
      rangeEnd: 'E4100000300',
      authorizedAt: '15/01/2026',
      expiresAt: '15/12/2026',
      used: 300,
      total: 300,
      status: 'Agotada',
      alert: true
    },
    {
      id: 4,
      companyId: 3,
      ncfType: '04 - Nota de Credito',
      series: 'B11',
      rangeStart: 'B1100000001',
      rangeEnd: 'B1100000200',
      authorizedAt: '01/02/2025',
      expiresAt: '01/02/2026',
      used: 88,
      total: 200,
      status: 'Vencida',
      alert: false
    },
    {
      id: 5,
      companyId: 2,
      ncfType: '14 - Regimen Especial',
      series: 'A12',
      rangeStart: 'A1200000001',
      rangeEnd: 'A1200000400',
      authorizedAt: '01/03/2026',
      expiresAt: '01/03/2027',
      used: 120,
      total: 400,
      status: 'Activa',
      alert: false
    }
  ];
  selectedNcfCompany: NcfCompany = this.ncfCompanies[0];
  selectedNcfSequence: NcfSequence = this.ncfSequences[0];
  ncfCompanyForm: NcfCompanyFormModel = {
    rnc: '',
    legalName: '',
    tradeName: '',
    address: '',
    phone: '',
    email: '',
    status: 'Activa'
  };
  ncfSequenceForm: NcfSequenceFormModel = {
    companyId: 1,
    ncfType: '01 - Credito Fiscal',
    series: 'E31',
    rangeStart: '',
    rangeEnd: '',
    authorizedAt: '',
    expiresAt: '',
    status: 'Activa'
  };
  rncSearch = '';
  rncMessage = 'Consulta, registra y da seguimiento a RNC sincronizados con tu base local.';
  rncRecords: RncRecord[] = [
    {
      id: 1,
      rnc: '101234567',
      legalName: 'Comercial ABC, SRL',
      tradeName: 'ABC Store',
      category: 'Contribuyente Normal',
      address: 'Av. 27 de Febrero 10, Santo Domingo',
      phone: '809-555-1234',
      email: 'info@abcstore.com',
      dgiiStatus: 'Activo',
      syncStatus: 'Sincronizado',
      lastCheck: '15/04/2026 08:20 AM'
    },
    {
      id: 2,
      rnc: '102345678',
      legalName: 'Distribuidora XYZ, SA',
      tradeName: 'XYZ Distribuciones',
      category: 'Gran Contribuyente',
      address: 'Calle Duarte 22, Santiago',
      phone: '809-555-5678',
      email: 'contacto@xyz.com',
      dgiiStatus: 'Activo',
      syncStatus: 'Pendiente',
      lastCheck: '14/04/2026 05:45 PM'
    },
    {
      id: 3,
      rnc: '103456789',
      legalName: 'Tech Solutions, EIRL',
      tradeName: 'TechSol',
      category: 'Servicios',
      address: 'Ave. Las Americas km 5',
      phone: '809-555-9012',
      email: 'admin@techsol.com',
      dgiiStatus: 'Suspendido',
      syncStatus: 'Error',
      lastCheck: '13/04/2026 11:10 AM'
    }
  ];
  selectedRncRecord: RncRecord = this.rncRecords[0];
  rncForm: RncFormModel = {
    rnc: '',
    legalName: '',
    tradeName: '',
    category: 'Contribuyente Normal',
    address: '',
    phone: '',
    email: '',
    dgiiStatus: 'Activo'
  };
  productSearch = '';
  productCategoryFilter = 'all';
  productStatusFilter = 'all';
  productMessage = 'Gestiona inventario, precios y stock de tus productos desde una sola pantalla.';
  openProductOptionsId: number | null = null;
  isProductEditorOpen = false;
  clientSearch = '';
  clientCategoryFilter = 'all';
  clientStatusFilter = 'all';
  clientMessage = 'Administra clientes, balances y condiciones comerciales desde una sola vista.';
  openClientOptionsId: number | null = null;
  isClientEditorOpen = false;
  supplierSearch = '';
  supplierCategoryFilter = 'all';
  supplierStatusFilter = 'all';
  supplierMessage = 'Gestiona suplidores, contactos, balances y condiciones de compra desde una sola pantalla.';
  openSupplierOptionsId: number | null = null;
  isSupplierEditorOpen = false;
  activeModuleLabel = '';
  activeModuleChild = '';
  invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
  invoiceForm: InvoiceFormModel = {
    customerId: null,
    invoiceDate: new Date().toISOString().slice(0, 10),
    ncfType: '02 - Consumo',
    paymentMethod: 'Contado',
    notes: ''
  };
  invoiceLines: InvoiceLine[] = [];
  private nextInvoiceLineId = 1;
  products: ProductRecord[] = [
    {
      id: 1,
      code: 'PROD-001',
      description: 'Laptop HP Pavilion 15',
      unit: 'Unidad',
      category: 'Electronica',
      location: 'Almacen A',
      brand: 'HP',
      type: 'Equipo',
      size: '15 pulgadas',
      stock: 25,
      minimumStock: 5,
      cost: 520,
      salePrice: 650,
      minimumPrice: 600,
      wholesalePrice: 620,
      minimumWholesaleQuantity: 3,
      replacementCode: 'HP-15-2026',
      exemptItbis: false,
      taxValue: 18,
      status: 'Activo'
    },
    {
      id: 2,
      code: 'PROD-002',
      description: 'Mouse Logitech MX Master 3',
      unit: 'Unidad',
      category: 'Electronica',
      location: 'Estante 1',
      brand: 'Logitech',
      type: 'Accesorio',
      size: 'Estandar',
      stock: 50,
      minimumStock: 10,
      cost: 60,
      salePrice: 85,
      minimumPrice: 78,
      wholesalePrice: 74,
      minimumWholesaleQuantity: 5,
      replacementCode: 'LOG-MX3',
      exemptItbis: false,
      taxValue: 18,
      status: 'Activo'
    },
    {
      id: 3,
      code: 'PROD-003',
      description: 'Teclado Mecanico RGB',
      unit: 'Unidad',
      category: 'Electronica',
      location: 'Estante 1',
      brand: 'Redragon',
      type: 'Accesorio',
      size: 'Full Size',
      stock: 3,
      minimumStock: 5,
      cost: 45,
      salePrice: 65,
      minimumPrice: 58,
      wholesalePrice: 55,
      minimumWholesaleQuantity: 4,
      replacementCode: 'RED-KB',
      exemptItbis: false,
      taxValue: 18,
      status: 'Agotado'
    },
    {
      id: 4,
      code: 'PROD-004',
      description: 'Monitor Samsung 27 4K',
      unit: 'Unidad',
      category: 'Electronica',
      location: 'Almacen B',
      brand: 'Samsung',
      type: 'Monitor',
      size: '27 pulgadas',
      stock: 15,
      minimumStock: 4,
      cost: 350,
      salePrice: 420,
      minimumPrice: 395,
      wholesalePrice: 405,
      minimumWholesaleQuantity: 2,
      replacementCode: 'SAM-27-4K',
      exemptItbis: false,
      taxValue: 18,
      status: 'Activo'
    },
    {
      id: 5,
      code: 'PROD-005',
      description: 'Cable HDMI 2.1 (3m)',
      unit: 'Unidad',
      category: 'Electronica',
      location: 'Estante 2',
      brand: 'Generic',
      type: 'Cable',
      size: '3 metros',
      stock: 0,
      minimumStock: 8,
      cost: 10,
      salePrice: 18,
      minimumPrice: 15,
      wholesalePrice: 14,
      minimumWholesaleQuantity: 10,
      replacementCode: 'HDMI-21-3M',
      exemptItbis: false,
      taxValue: 18,
      status: 'Inactivo'
    }
  ];
  selectedProduct: ProductRecord = this.products[0];
  productForm: ProductFormModel = {
    code: '',
    description: '',
    unit: 'Unidad',
    category: 'Electronica',
    location: '',
    brand: '',
    type: '',
    size: '',
    stock: 0,
    minimumStock: 0,
    cost: 0,
    salePrice: 0,
    minimumPrice: 0,
    wholesalePrice: 0,
    minimumWholesaleQuantity: 0,
    replacementCode: '',
    exemptItbis: false,
    taxValue: 18,
    status: 'Activo'
  };
  clients: ClientRecord[] = [
    {
      id: 1,
      code: 'CLI-001',
      fullName: 'Carlos Perez',
      companyName: 'Perez Solutions SRL',
      documentType: 'RNC',
      documentNumber: '132456781',
      phone: '(809) 555-1020',
      email: 'c.perez@perezsolutions.com',
      address: 'Av. Sarasota 15, Bella Vista',
      city: 'Santo Domingo',
      category: 'Corporativo',
      creditLimit: 150000,
      balance: 28500,
      status: 'Activo',
      lastPurchase: '14/04/2026'
    },
    {
      id: 2,
      code: 'CLI-002',
      fullName: 'Ana Garcia',
      companyName: '',
      documentType: 'Cedula',
      documentNumber: '00112345678',
      phone: '(829) 555-7741',
      email: 'anagarcia@gmail.com',
      address: 'Calle Mella 22, Los Mina',
      city: 'Santo Domingo Este',
      category: 'Minorista',
      creditLimit: 25000,
      balance: 3200,
      status: 'Activo',
      lastPurchase: '13/04/2026'
    },
    {
      id: 3,
      code: 'CLI-003',
      fullName: 'Distribuidora Norte',
      companyName: 'Distribuidora Norte SRL',
      documentType: 'RNC',
      documentNumber: '131998812',
      phone: '(809) 555-8844',
      email: 'ventas@dnorte.com',
      address: 'Calle Restauracion 80, Santiago',
      city: 'Santiago',
      category: 'Mayorista',
      creditLimit: 225000,
      balance: 0,
      status: 'Activo',
      lastPurchase: '10/04/2026'
    },
    {
      id: 4,
      code: 'CLI-004',
      fullName: 'Luis Martinez',
      companyName: '',
      documentType: 'Cedula',
      documentNumber: '40211223344',
      phone: '(849) 555-6622',
      email: 'luis.martinez@gmail.com',
      address: 'Av. Padre Abreu 9, La Romana',
      city: 'La Romana',
      category: 'Minorista',
      creditLimit: 15000,
      balance: 7800,
      status: 'Bloqueado',
      lastPurchase: '08/04/2026'
    }
  ];
  selectedClient: ClientRecord = this.clients[0];
  clientForm: ClientFormModel = {
    code: '',
    fullName: '',
    companyName: '',
    documentType: 'Cedula',
    documentNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    category: 'Minorista',
    creditLimit: 0,
    balance: 0,
    status: 'Activo'
  };
  suppliers: SupplierRecord[] = [
    {
      id: 1,
      code: 'SUP-001',
      companyName: 'Tech Import SRL',
      contactName: 'Mariela Gomez',
      documentType: 'RNC',
      documentNumber: '131456789',
      phone: '(809) 555-2121',
      email: 'ventas@techimport.com',
      address: 'Zona Franca, Nave 8',
      city: 'Santo Domingo',
      category: 'Importador',
      paymentTerms: '30 dias',
      balance: 42000,
      status: 'Activo',
      lastOrder: '14/04/2026'
    },
    {
      id: 2,
      code: 'SUP-002',
      companyName: 'Papeleria Central',
      contactName: 'Ramon Lora',
      documentType: 'RNC',
      documentNumber: '101334455',
      phone: '(809) 555-3344',
      email: 'compras@papeleriacentral.com',
      address: 'Av. Duarte 112',
      city: 'Santiago',
      category: 'Local',
      paymentTerms: 'Contado',
      balance: 0,
      status: 'Activo',
      lastOrder: '12/04/2026'
    },
    {
      id: 3,
      code: 'SUP-003',
      companyName: 'Servicios Logisticos del Este',
      contactName: 'Andres Mejia',
      documentType: 'RNC',
      documentNumber: '132112233',
      phone: '(829) 555-7766',
      email: 'operaciones@sle.com',
      address: 'Carretera Mella km 9',
      city: 'Santo Domingo Este',
      category: 'Servicios',
      paymentTerms: '15 dias',
      balance: 18500,
      status: 'Suspendido',
      lastOrder: '09/04/2026'
    },
    {
      id: 4,
      code: 'SUP-004',
      companyName: 'OfiMarket Caribe',
      contactName: 'Laura Castillo',
      documentType: 'RNC',
      documentNumber: '133667788',
      phone: '(849) 555-9911',
      email: 'laura@ofimarket.do',
      address: 'Av. Circunvalacion Norte 20',
      city: 'Santiago',
      category: 'Local',
      paymentTerms: 'Credito 45 dias',
      balance: 7600,
      status: 'Activo',
      lastOrder: '11/04/2026'
    }
  ];
  selectedSupplier: SupplierRecord = this.suppliers[0];
  supplierForm: SupplierFormModel = {
    code: '',
    companyName: '',
    contactName: '',
    documentType: 'RNC',
    documentNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    category: 'Local',
    paymentTerms: '',
    balance: 0,
    status: 'Activo'
  };
  private nextCompanyId = 4;
  private nextUserId = 4;
  private nextNcfCompanyId = 4;
  private nextNcfSequenceId = 6;
  private nextRncId = 4;
  private nextProductId = 6;
  private nextClientId = 5;
  private nextSupplierId = 5;

  constructor() {
    this.loadCompanyIntoForm(this.selectedCompany, 'edit');
    this.loadUserIntoForm(this.selectedUser, 'edit');
    this.loadNcfCompanyIntoForm(this.selectedNcfCompany, 'edit');
    this.loadNcfSequenceIntoForm(this.selectedNcfSequence, 'edit');
    this.loadRncIntoForm(this.selectedRncRecord, 'edit');
    this.loadProductIntoForm(this.selectedProduct, 'edit');
    this.loadClientIntoForm(this.selectedClient, 'edit');
    this.loadSupplierIntoForm(this.selectedSupplier, 'edit');
    this.startNewInvoice();
  }

  get activeCompanyCount(): number {
    return this.companies.filter((company) => company.status === 'Activa').length;
  }

  get inactiveCompanyCount(): number {
    return this.companies.filter((company) => company.status === 'Inactiva').length;
  }

  get activeUserCount(): number {
    return this.users.filter((user) => user.status === 'Activo').length;
  }

  get inactiveUserCount(): number {
    return this.users.filter((user) => user.status === 'Inactivo').length;
  }

  get availableBranches(): string[] {
    if (!this.userForm.companyId) {
      return [];
    }

    return this.companyBranches[this.userForm.companyId] ?? [];
  }

  get filteredNcfCompanies(): NcfCompany[] {
    const term = this.ncfSearch.trim().toLowerCase();
    if (!term) {
      return this.ncfCompanies;
    }

    return this.ncfCompanies.filter((company) =>
      [company.rnc, company.legalName, company.tradeName].some((value) => value.toLowerCase().includes(term))
    );
  }

  get filteredNcfSequences(): NcfSequence[] {
    return this.ncfSequences.filter((sequence) => {
      const matchesSearch = !this.ncfSequenceSearch.trim()
        || [this.getNcfCompanyName(sequence.companyId), sequence.series, sequence.ncfType]
          .some((value) => value.toLowerCase().includes(this.ncfSequenceSearch.trim().toLowerCase()));
      const matchesCompany = this.ncfSequenceCompanyFilter === 'all'
        || String(sequence.companyId) === this.ncfSequenceCompanyFilter;
      const matchesType = this.ncfSequenceTypeFilter === 'all'
        || sequence.ncfType === this.ncfSequenceTypeFilter;
      const matchesStatus = this.ncfSequenceStatusFilter === 'all'
        || sequence.status === this.ncfSequenceStatusFilter;

      return matchesSearch && matchesCompany && matchesType && matchesStatus;
    });
  }

  get ncfStats(): { label: string; value: number; tone: string }[] {
    return [
      { label: 'Total Secuencias', value: this.ncfSequences.length, tone: 'neutral' },
      { label: 'Activas', value: this.ncfSequences.filter((item) => item.status === 'Activa').length, tone: 'success' },
      { label: 'Agotadas', value: this.ncfSequences.filter((item) => item.status === 'Agotada').length, tone: 'danger' },
      { label: 'Vencidas', value: this.ncfSequences.filter((item) => item.status === 'Vencida').length, tone: 'warning' },
      { label: 'Con Alertas', value: this.ncfSequences.filter((item) => item.alert).length, tone: 'alert' }
    ];
  }

  get filteredRncRecords(): RncRecord[] {
    const term = this.rncSearch.trim().toLowerCase();
    if (!term) {
      return this.rncRecords;
    }

    return this.rncRecords.filter((record) =>
      [record.rnc, record.legalName, record.tradeName].some((value) => value.toLowerCase().includes(term))
    );
  }

  get activeRncCount(): number {
    return this.rncRecords.filter((record) => record.dgiiStatus === 'Activo').length;
  }

  get pendingSyncRncCount(): number {
    return this.rncRecords.filter((record) => record.syncStatus === 'Pendiente').length;
  }

  get syncErrorRncCount(): number {
    return this.rncRecords.filter((record) => record.syncStatus === 'Error').length;
  }

  get filteredProducts(): ProductRecord[] {
    return this.products.filter((product) => {
      const matchesSearch = !this.productSearch.trim()
        || [product.code, product.description, product.brand].some((value) =>
          value.toLowerCase().includes(this.productSearch.trim().toLowerCase()));
      const matchesCategory = this.productCategoryFilter === 'all' || product.category === this.productCategoryFilter;
      const matchesStatus = this.productStatusFilter === 'all' || product.status === this.productStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  get totalProductsCount(): number {
    return this.products.length;
  }

  get activeProductsCount(): number {
    return this.products.filter((product) => product.status === 'Activo').length;
  }

  get lowStockProductsCount(): number {
    return this.products.filter((product) => product.stock > 0 && product.stock <= product.minimumStock).length;
  }

  get outOfStockProductsCount(): number {
    return this.products.filter((product) => product.stock === 0 || product.status === 'Agotado').length;
  }

  get invoiceSubtotal(): number {
    return this.invoiceLines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  }

  get invoiceTaxTotal(): number {
    return this.invoiceLines.reduce((sum, line) => sum + line.taxAmount, 0);
  }

  get invoiceGrandTotal(): number {
    return this.invoiceSubtotal + this.invoiceTaxTotal;
  }

  get invoiceCustomer(): ClientRecord | undefined {
    const id = this.invoiceForm.customerId;
    if (!id) {
      return undefined;
    }
    return this.clients.find((client) => client.id === id);
  }

  getInvoiceProductCode(productId: number | null): string {
    if (!productId) {
      return '---';
    }
    return this.products.find((p) => p.id === productId)?.code ?? '---';
  }

  get filteredClients(): ClientRecord[] {
    return this.clients.filter((client) => {
      const matchesSearch = !this.clientSearch.trim()
        || [client.code, client.fullName, client.companyName, client.documentNumber]
          .some((value) => value.toLowerCase().includes(this.clientSearch.trim().toLowerCase()));
      const matchesCategory = this.clientCategoryFilter === 'all' || client.category === this.clientCategoryFilter;
      const matchesStatus = this.clientStatusFilter === 'all' || client.status === this.clientStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  get totalClientsCount(): number {
    return this.clients.length;
  }

  get activeClientsCount(): number {
    return this.clients.filter((client) => client.status === 'Activo').length;
  }

  get clientsWithBalanceCount(): number {
    return this.clients.filter((client) => client.balance > 0).length;
  }

  get corporateClientsCount(): number {
    return this.clients.filter((client) => client.category === 'Corporativo' || client.category === 'Mayorista').length;
  }

  get filteredSuppliers(): SupplierRecord[] {
    return this.suppliers.filter((supplier) => {
      const matchesSearch = !this.supplierSearch.trim()
        || [supplier.code, supplier.companyName, supplier.contactName, supplier.documentNumber]
          .some((value) => value.toLowerCase().includes(this.supplierSearch.trim().toLowerCase()));
      const matchesCategory = this.supplierCategoryFilter === 'all' || supplier.category === this.supplierCategoryFilter;
      const matchesStatus = this.supplierStatusFilter === 'all' || supplier.status === this.supplierStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  get totalSuppliersCount(): number {
    return this.suppliers.length;
  }

  get activeSuppliersCount(): number {
    return this.suppliers.filter((supplier) => supplier.status === 'Activo').length;
  }

  get suppliersWithBalanceCount(): number {
    return this.suppliers.filter((supplier) => supplier.balance > 0).length;
  }

  get importerSuppliersCount(): number {
    return this.suppliers.filter((supplier) => supplier.category === 'Importador').length;
  }

  toggleSection(section: string): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  showDashboard(): void {
    this.activeView = 'dashboard';
  }

  selectModuleChild(module: ModuleItem, child: string): void {
    this.activeModuleLabel = module.label;
    this.activeModuleChild = child;

    if (module.label === 'Facturacion' && child === 'Nueva Factura') {
      this.activeView = 'invoice_new';
      this.startNewInvoice();
    }
  }

  selectMaintenanceItem(item: NavigationItem): void {
    this.activeMaintenanceLabel = item.label;
    if (item.label === 'Productos') {
      this.activeView = 'products';
      this.selectProduct(this.selectedProduct);
      return;
    }

    if (item.label === 'Clientes') {
      this.activeView = 'clients';
      this.selectClient(this.selectedClient);
      return;
    }

    if (item.label === 'Suplidores') {
      this.activeView = 'suppliers';
      this.selectSupplier(this.selectedSupplier);
    }
  }

  selectSettingsItem(item: NavigationItem): void {
    this.activeSettingsLabel = item.label;
    if (item.label === 'Empresa') {
      this.activeView = 'company';
      this.selectCompany(this.selectedCompany);
      return;
    }

    if (item.label === 'Usuarios') {
      this.activeView = 'users';
      this.selectUser(this.selectedUser);
      return;
    }

    if (item.label === 'NCF') {
      this.activeView = 'ncf';
      this.ncfViewMode = 'companies';
      return;
    }

    if (item.label === 'RNC') {
      this.activeView = 'rnc';
      this.selectRncRecord(this.selectedRncRecord);
    }
  }

  setNcfViewMode(mode: 'companies' | 'sequences'): void {
    this.ncfViewMode = mode;
  }

  onUserCompanyChange(): void {
    if (!this.userForm.companyId) {
      this.userForm.branch = '';
      return;
    }

    const branches = this.availableBranches;
    if (!branches.includes(this.userForm.branch)) {
      this.userForm.branch = '';
    }
  }

  saveUser(): void {
    const { firstName, lastName, email, companyId, branch, role, phone, status } = this.userForm;

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !companyId || !branch || !role) {
      this.userMessage = 'Completa informacion personal, empresa, sucursal y rol antes de crear el usuario.';
      return;
    }

    const fullName = `${firstName} ${lastName}`.trim();

    if (this.userEditorMode === 'create') {
      const newUser: UserRecord = {
        id: this.nextUserId++,
        firstName,
        lastName,
        fullName,
        email,
        phone,
        companyId,
        branch,
        role,
        status,
        avatar: `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
        lastUpdate: this.formatTimestamp()
      };

      this.users = [newUser, ...this.users];
      this.selectedUser = newUser;
      this.loadUserIntoForm(newUser, 'edit');
      this.userMessage = `Usuario ${newUser.fullName} creado correctamente con rol ${role}.`;
      return;
    }

    this.users = this.users.map((user) =>
      user.id === this.selectedUser.id
        ? {
            ...user,
            ...this.userForm,
            fullName,
            avatar: `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
            lastUpdate: this.formatTimestamp()
          }
        : user
    );

    const updatedUser = this.users.find((user) => user.id === this.selectedUser.id);
    if (updatedUser) {
      this.selectedUser = updatedUser;
      this.loadUserIntoForm(updatedUser, 'edit');
      this.userMessage = `Usuario ${updatedUser.fullName} actualizado correctamente.`;
    }
  }

  resetUserForm(): void {
    this.userForm = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      companyId: null,
      branch: '',
      role: '',
      status: 'Activo'
    };
    this.userEditorMode = 'create';
    this.userMessage = 'Completa los datos para agregar un nuevo usuario.';
  }

  selectUser(user: UserRecord): void {
    this.selectedUser = user;
    this.loadUserIntoForm(user, 'edit');
    this.userMessage = `Editando al usuario ${user.fullName}.`;
  }

  startCreateUser(): void {
    this.resetUserForm();
  }

  toggleSelectedUserStatus(): void {
    this.userForm.status = this.selectedUser.status === 'Activo' ? 'Inactivo' : 'Activo';
    this.saveUser();
  }

  getCompanyName(companyId: number | null): string {
    if (!companyId) {
      return 'Sin empresa';
    }

    return this.companies.find((company) => company.id === companyId)?.tradeName ?? 'Sin empresa';
  }

  getNcfCompanyName(companyId: number): string {
    return this.ncfCompanies.find((company) => company.id === companyId)?.legalName ?? 'Empresa no disponible';
  }

  getNcfCompanyRnc(companyId: number): string {
    return this.ncfCompanies.find((company) => company.id === companyId)?.rnc ?? '---';
  }

  getNcfSequencesByCompany(companyId: number): NcfSequence[] {
    return this.ncfSequences.filter((sequence) => sequence.companyId === companyId);
  }

  getNcfUsagePercent(sequence: NcfSequence): number {
    return Math.min(100, Math.round((sequence.used / sequence.total) * 100));
  }

  canDeleteNcfCompany(company: NcfCompany): boolean {
    return this.getNcfSequencesByCompany(company.id).length === 0;
  }

  selectNcfCompany(company: NcfCompany): void {
    this.selectedNcfCompany = company;
    this.loadNcfCompanyIntoForm(company, 'edit');
    this.ncfCompanyMessage = `Editando la empresa ${company.tradeName}.`;
    this.openNcfCompanyActionsId = null;
  }

  startCreateNcfCompany(): void {
    this.ncfCompanyEditorMode = 'create';
    this.ncfCompanyForm = {
      rnc: '',
      legalName: '',
      tradeName: '',
      address: '',
      phone: '',
      email: '',
      status: 'Activa'
    };
    this.ncfCompanyMessage = 'Completa los datos para registrar una nueva empresa para e-NCF.';
  }

  saveNcfCompany(): void {
    if (!this.ncfCompanyForm.rnc.trim() || !this.ncfCompanyForm.legalName.trim() || !this.ncfCompanyForm.tradeName.trim()) {
      this.ncfCompanyMessage = 'Completa RNC, razon social y nombre comercial antes de guardar.';
      return;
    }

    if (this.ncfCompanyEditorMode === 'create') {
      const newCompany: NcfCompany = {
        id: this.nextNcfCompanyId++,
        ...this.ncfCompanyForm,
        createdAt: this.formatDateOnly()
      };
      this.ncfCompanies = [newCompany, ...this.ncfCompanies];
      this.selectedNcfCompany = newCompany;
      this.loadNcfCompanyIntoForm(newCompany, 'edit');
      this.ncfCompanyMessage = `Empresa ${newCompany.tradeName} registrada correctamente.`;
      return;
    }

    this.ncfCompanies = this.ncfCompanies.map((company) =>
      company.id === this.selectedNcfCompany.id ? { ...company, ...this.ncfCompanyForm } : company
    );
    const updated = this.ncfCompanies.find((company) => company.id === this.selectedNcfCompany.id);
    if (updated) {
      this.selectedNcfCompany = updated;
      this.loadNcfCompanyIntoForm(updated, 'edit');
      this.ncfCompanyMessage = `Empresa ${updated.tradeName} actualizada correctamente.`;
    }
  }

  deleteNcfCompany(company: NcfCompany): void {
    if (!this.canDeleteNcfCompany(company)) {
      this.ncfCompanyMessage = `No se puede eliminar ${company.tradeName} porque tiene secuencias asignadas.`;
      return;
    }

    this.ncfCompanies = this.ncfCompanies.filter((item) => item.id !== company.id);
    this.openNcfCompanyActionsId = null;
    this.selectedNcfCompany = this.ncfCompanies[0];
    if (this.selectedNcfCompany) {
      this.loadNcfCompanyIntoForm(this.selectedNcfCompany, 'edit');
    } else {
      this.startCreateNcfCompany();
    }
    this.ncfCompanyMessage = `Empresa ${company.tradeName} eliminada correctamente.`;
  }

  viewNcfCompanySequences(company: NcfCompany): void {
    this.selectedNcfCompany = company;
    this.ncfSequenceCompanyFilter = String(company.id);
    this.ncfViewMode = 'sequences';
    this.openNcfCompanyActionsId = null;
    const firstSequence = this.getNcfSequencesByCompany(company.id)[0];
    if (firstSequence) {
      this.selectNcfSequence(firstSequence);
    }
  }

  toggleNcfCompanyActions(companyId: number): void {
    this.openNcfCompanyActionsId = this.openNcfCompanyActionsId === companyId ? null : companyId;
  }

  selectRncRecord(record: RncRecord): void {
    this.selectedRncRecord = record;
    this.loadRncIntoForm(record, 'edit');
    this.rncMessage = `Editando el RNC ${record.rnc} de ${record.tradeName}.`;
  }

  startCreateRnc(): void {
    this.rncEditorMode = 'create';
    this.rncForm = {
      rnc: '',
      legalName: '',
      tradeName: '',
      category: 'Contribuyente Normal',
      address: '',
      phone: '',
      email: '',
      dgiiStatus: 'Activo'
    };
    this.rncMessage = 'Completa los datos para registrar un nuevo RNC en tu base local.';
  }

  selectProduct(product: ProductRecord): void {
    this.openProductOptionsId = null;
    this.selectedProduct = product;
    this.productMessage = `Producto seleccionado: ${product.description}.`;
  }

  toggleProductOptions(productId: number, event: Event): void {
    event.stopPropagation();
    this.openProductOptionsId = this.openProductOptionsId === productId ? null : productId;
  }

  editProduct(product: ProductRecord, event?: Event): void {
    event?.stopPropagation();
    this.openProductOptionsId = null;
    this.selectedProduct = product;
    this.loadProductIntoForm(product, 'edit');
    this.productMessage = `Editando el producto ${product.description}.`;
    this.isProductEditorOpen = true;
  }

  closeProductOptions(): void {
    this.openProductOptionsId = null;
  }

  selectClient(client: ClientRecord): void {
    this.openClientOptionsId = null;
    this.selectedClient = client;
    this.clientMessage = `Cliente seleccionado: ${client.fullName}.`;
  }

  toggleClientOptions(clientId: number, event: Event): void {
    event.stopPropagation();
    this.openClientOptionsId = this.openClientOptionsId === clientId ? null : clientId;
  }

  editClient(client: ClientRecord, event?: Event): void {
    event?.stopPropagation();
    this.openClientOptionsId = null;
    this.selectedClient = client;
    this.loadClientIntoForm(client, 'edit');
    this.clientMessage = `Editando el cliente ${client.fullName}.`;
    this.isClientEditorOpen = true;
  }

  closeClientOptions(): void {
    this.openClientOptionsId = null;
  }

  startCreateClient(): void {
    this.openClientOptionsId = null;
    this.clientEditorMode = 'create';
    this.clientForm = {
      code: '',
      fullName: '',
      companyName: '',
      documentType: 'Cedula',
      documentNumber: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      category: 'Minorista',
      creditLimit: 0,
      balance: 0,
      status: 'Activo'
    };
    this.clientMessage = 'Completa los datos para registrar un nuevo cliente.';
    this.isClientEditorOpen = true;
  }

  closeClientEditor(): void {
    this.isClientEditorOpen = false;
  }

  saveClient(): void {
    if (!this.clientForm.code.trim() || !this.clientForm.fullName.trim() || !this.clientForm.documentNumber.trim()) {
      this.clientMessage = 'Completa codigo, nombre y documento antes de guardar.';
      return;
    }

    if (this.clientEditorMode === 'create') {
      const newClient: ClientRecord = {
        id: this.nextClientId++,
        ...this.clientForm,
        lastPurchase: this.formatDateOnly()
      };
      this.clients = [newClient, ...this.clients];
      this.selectedClient = newClient;
      this.loadClientIntoForm(newClient, 'edit');
      this.clientMessage = `Cliente ${newClient.fullName} registrado correctamente.`;
      this.isClientEditorOpen = false;
      return;
    }

    this.clients = this.clients.map((client) =>
      client.id === this.selectedClient.id ? { ...client, ...this.clientForm } : client
    );
    const updated = this.clients.find((client) => client.id === this.selectedClient.id);
    if (updated) {
      this.selectedClient = updated;
      this.loadClientIntoForm(updated, 'edit');
      this.clientMessage = `Cliente ${updated.fullName} actualizado correctamente.`;
      this.isClientEditorOpen = false;
    }
  }

  selectSupplier(supplier: SupplierRecord): void {
    this.openSupplierOptionsId = null;
    this.selectedSupplier = supplier;
    this.supplierMessage = `Suplidor seleccionado: ${supplier.companyName}.`;
  }

  toggleSupplierOptions(supplierId: number, event: Event): void {
    event.stopPropagation();
    this.openSupplierOptionsId = this.openSupplierOptionsId === supplierId ? null : supplierId;
  }

  editSupplier(supplier: SupplierRecord, event?: Event): void {
    event?.stopPropagation();
    this.openSupplierOptionsId = null;
    this.selectedSupplier = supplier;
    this.loadSupplierIntoForm(supplier, 'edit');
    this.supplierMessage = `Editando el suplidor ${supplier.companyName}.`;
    this.isSupplierEditorOpen = true;
  }

  closeSupplierOptions(): void {
    this.openSupplierOptionsId = null;
  }

  startCreateSupplier(): void {
    this.openSupplierOptionsId = null;
    this.supplierEditorMode = 'create';
    this.supplierForm = {
      code: '',
      companyName: '',
      contactName: '',
      documentType: 'RNC',
      documentNumber: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      category: 'Local',
      paymentTerms: '',
      balance: 0,
      status: 'Activo'
    };
    this.supplierMessage = 'Completa los datos para registrar un nuevo suplidor.';
    this.isSupplierEditorOpen = true;
  }

  closeSupplierEditor(): void {
    this.isSupplierEditorOpen = false;
  }

  saveSupplier(): void {
    if (!this.supplierForm.code.trim() || !this.supplierForm.companyName.trim() || !this.supplierForm.documentNumber.trim()) {
      this.supplierMessage = 'Completa codigo, nombre comercial y documento antes de guardar.';
      return;
    }

    if (this.supplierEditorMode === 'create') {
      const newSupplier: SupplierRecord = {
        id: this.nextSupplierId++,
        ...this.supplierForm,
        lastOrder: this.formatDateOnly()
      };
      this.suppliers = [newSupplier, ...this.suppliers];
      this.selectedSupplier = newSupplier;
      this.loadSupplierIntoForm(newSupplier, 'edit');
      this.supplierMessage = `Suplidor ${newSupplier.companyName} registrado correctamente.`;
      this.isSupplierEditorOpen = false;
      return;
    }

    this.suppliers = this.suppliers.map((supplier) =>
      supplier.id === this.selectedSupplier.id ? { ...supplier, ...this.supplierForm } : supplier
    );
    const updated = this.suppliers.find((supplier) => supplier.id === this.selectedSupplier.id);
    if (updated) {
      this.selectedSupplier = updated;
      this.loadSupplierIntoForm(updated, 'edit');
      this.supplierMessage = `Suplidor ${updated.companyName} actualizado correctamente.`;
      this.isSupplierEditorOpen = false;
    }
  }

  startNewInvoice(): void {
    this.invoiceForm = {
      customerId: this.selectedClient?.id ?? null,
      invoiceDate: new Date().toISOString().slice(0, 10),
      ncfType: this.ncfTypes[0] ?? '02 - Consumo',
      paymentMethod: 'Contado',
      notes: ''
    };
    this.invoiceLines = [this.createEmptyInvoiceLine()];
    this.invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
  }

  addInvoiceLine(): void {
    this.invoiceLines = [...this.invoiceLines, this.createEmptyInvoiceLine()];
  }

  removeInvoiceLine(lineId: number): void {
    this.invoiceLines = this.invoiceLines.filter((line) => line.id !== lineId);
    if (this.invoiceLines.length === 0) {
      this.invoiceLines = [this.createEmptyInvoiceLine()];
    }
  }

  onInvoiceProductChange(line: InvoiceLine, productIdValue: string): void {
    const productId = productIdValue ? Number(productIdValue) : null;
    const product = productId ? this.products.find((p) => p.id === productId) : undefined;
    const taxRate = product && !product.exemptItbis ? product.taxValue : 0;
    const unitPrice = product ? product.salePrice : 0;
    const description = product ? product.description : '';

    this.updateInvoiceLine(line.id, {
      productId,
      description,
      unitPrice,
      taxRate
    });
  }

  onInvoiceLineChange(lineId: number, patch: Partial<Pick<InvoiceLine, 'quantity' | 'unitPrice'>>): void {
    this.updateInvoiceLine(lineId, patch);
  }

  saveInvoice(): void {
    if (!this.invoiceForm.customerId) {
      this.invoiceMessage = 'Selecciona un cliente antes de guardar la factura.';
      return;
    }

    const hasValidLine = this.invoiceLines.some((line) => line.productId && line.quantity > 0);
    if (!hasValidLine) {
      this.invoiceMessage = 'Agrega al menos un producto con cantidad mayor a 0.';
      return;
    }

    this.invoiceMessage = 'Factura guardada (demo).';
  }

  private updateInvoiceLine(lineId: number, patch: Partial<InvoiceLine>): void {
    this.invoiceLines = this.invoiceLines.map((line) => {
      if (line.id !== lineId) {
        return line;
      }

      const next = { ...line, ...patch };
      const lineSubtotal = next.quantity * next.unitPrice;
      const taxAmount = Math.max(0, lineSubtotal * (next.taxRate / 100));
      const lineTotal = lineSubtotal + taxAmount;
      return { ...next, taxAmount, lineTotal };
    });
  }

  private createEmptyInvoiceLine(): InvoiceLine {
    return {
      id: this.nextInvoiceLineId++,
      productId: null,
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 0
    };
  }

  startCreateProduct(): void {
    this.openProductOptionsId = null;
    this.productEditorMode = 'create';
    this.productForm = {
      code: '',
      description: '',
      unit: 'Unidad',
      category: 'Electronica',
      location: '',
      brand: '',
      type: '',
      size: '',
      stock: 0,
      minimumStock: 0,
      cost: 0,
      salePrice: 0,
      minimumPrice: 0,
      wholesalePrice: 0,
      minimumWholesaleQuantity: 0,
      replacementCode: '',
      exemptItbis: false,
      taxValue: 18,
      status: 'Activo'
    };
    this.productMessage = 'Completa los datos para registrar un nuevo producto.';
    this.isProductEditorOpen = true;
  }

  closeProductEditor(): void {
    this.isProductEditorOpen = false;
  }

  saveProduct(): void {
    if (!this.productForm.code.trim() || !this.productForm.description.trim()) {
      this.productMessage = 'Completa codigo y descripcion antes de guardar.';
      return;
    }

    if (this.productEditorMode === 'create') {
      const newProduct: ProductRecord = {
        id: this.nextProductId++,
        ...this.productForm
      };
      this.products = [newProduct, ...this.products];
      this.selectedProduct = newProduct;
      this.loadProductIntoForm(newProduct, 'edit');
      this.productMessage = `Producto ${newProduct.description} registrado correctamente.`;
      this.isProductEditorOpen = false;
      return;
    }

    this.products = this.products.map((product) =>
      product.id === this.selectedProduct.id ? { ...product, ...this.productForm } : product
    );
    const updated = this.products.find((product) => product.id === this.selectedProduct.id);
    if (updated) {
      this.selectedProduct = updated;
      this.loadProductIntoForm(updated, 'edit');
      this.productMessage = `Producto ${updated.description} actualizado correctamente.`;
      this.isProductEditorOpen = false;
    }
  }

  private loadProductIntoForm(product: ProductRecord, mode: 'create' | 'edit'): void {
    this.productEditorMode = mode;
    this.productForm = { ...product };
    delete (this.productForm as Partial<ProductRecord>).id;
  }

  private loadClientIntoForm(client: ClientRecord, mode: 'create' | 'edit'): void {
    this.clientEditorMode = mode;
    this.clientForm = {
      code: client.code,
      fullName: client.fullName,
      companyName: client.companyName,
      documentType: client.documentType,
      documentNumber: client.documentNumber,
      phone: client.phone,
      email: client.email,
      address: client.address,
      city: client.city,
      category: client.category,
      creditLimit: client.creditLimit,
      balance: client.balance,
      status: client.status
    };
  }

  private loadSupplierIntoForm(supplier: SupplierRecord, mode: 'create' | 'edit'): void {
    this.supplierEditorMode = mode;
    this.supplierForm = {
      code: supplier.code,
      companyName: supplier.companyName,
      contactName: supplier.contactName,
      documentType: supplier.documentType,
      documentNumber: supplier.documentNumber,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      city: supplier.city,
      category: supplier.category,
      paymentTerms: supplier.paymentTerms,
      balance: supplier.balance,
      status: supplier.status
    };
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeProductOptions();
    this.closeClientOptions();
    this.closeSupplierOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProductOptions();
    this.closeClientOptions();
    this.closeSupplierOptions();
    this.isProductEditorOpen = false;
    this.isClientEditorOpen = false;
    this.isSupplierEditorOpen = false;
  }

  saveRnc(): void {
    if (!this.rncForm.rnc.trim() || !this.rncForm.legalName.trim() || !this.rncForm.tradeName.trim()) {
      this.rncMessage = 'Completa RNC, razon social y nombre comercial antes de guardar.';
      return;
    }

    if (this.rncEditorMode === 'create') {
      const newRecord: RncRecord = {
        id: this.nextRncId++,
        ...this.rncForm,
        syncStatus: 'Pendiente',
        lastCheck: this.formatTimestamp()
      };
      this.rncRecords = [newRecord, ...this.rncRecords];
      this.selectedRncRecord = newRecord;
      this.loadRncIntoForm(newRecord, 'edit');
      this.rncMessage = `RNC ${newRecord.rnc} registrado correctamente y marcado para sincronizacion.`;
      return;
    }

    this.rncRecords = this.rncRecords.map((record) =>
      record.id === this.selectedRncRecord.id
        ? {
            ...record,
            ...this.rncForm,
            lastCheck: this.formatTimestamp()
          }
        : record
    );

    const updated = this.rncRecords.find((record) => record.id === this.selectedRncRecord.id);
    if (updated) {
      this.selectedRncRecord = updated;
      this.loadRncIntoForm(updated, 'edit');
      this.rncMessage = `RNC ${updated.rnc} actualizado correctamente.`;
    }
  }

  markRncForDgiiSync(record: RncRecord): void {
    this.rncRecords = this.rncRecords.map((item) =>
      item.id === record.id
        ? { ...item, syncStatus: 'Pendiente', lastCheck: this.formatTimestamp() }
        : item
    );
    const updated = this.rncRecords.find((item) => item.id === record.id);
    if (updated) {
      this.selectedRncRecord = updated;
      this.loadRncIntoForm(updated, 'edit');
      this.rncMessage = `RNC ${updated.rnc} marcado para actualizacion desde DGII.`;
    }
  }

  private loadRncIntoForm(record: RncRecord, mode: 'create' | 'edit'): void {
    this.rncEditorMode = mode;
    this.rncForm = {
      rnc: record.rnc,
      legalName: record.legalName,
      tradeName: record.tradeName,
      category: record.category,
      address: record.address,
      phone: record.phone,
      email: record.email,
      dgiiStatus: record.dgiiStatus
    };
  }

  selectNcfSequence(sequence: NcfSequence): void {
    this.selectedNcfSequence = sequence;
    this.loadNcfSequenceIntoForm(sequence, 'edit');
    this.ncfSequenceMessage = `Editando la secuencia ${sequence.series} de ${this.getNcfCompanyName(sequence.companyId)}.`;
  }

  startCreateNcfSequence(): void {
    this.ncfSequenceEditorMode = 'create';
    this.ncfSequenceForm = {
      companyId: this.selectedNcfCompany?.id ?? this.ncfCompanies[0]?.id ?? null,
      ncfType: '01 - Credito Fiscal',
      series: 'E31',
      rangeStart: '',
      rangeEnd: '',
      authorizedAt: '',
      expiresAt: '',
      status: 'Activa'
    };
    this.ncfSequenceMessage = 'Completa los datos para asignar un nuevo rango de secuencia NCF.';
  }

  saveNcfSequence(): void {
    const form = this.ncfSequenceForm;
    if (!form.companyId || !form.rangeStart.trim() || !form.rangeEnd.trim() || !form.authorizedAt || !form.expiresAt) {
      this.ncfSequenceMessage = 'Completa empresa, rango y fechas de autorizacion/vencimiento antes de guardar.';
      return;
    }
    const companyId = form.companyId;

    if (this.ncfSequenceEditorMode === 'create') {
      const total = this.calculateSequenceCount(form.rangeStart, form.rangeEnd);
      const newSequence: NcfSequence = {
        id: this.nextNcfSequenceId++,
        companyId,
        ncfType: form.ncfType,
        series: form.series,
        rangeStart: form.rangeStart,
        rangeEnd: form.rangeEnd,
        authorizedAt: form.authorizedAt,
        expiresAt: form.expiresAt,
        used: 0,
        total,
        status: form.status,
        alert: false
      };
      this.ncfSequences = [newSequence, ...this.ncfSequences];
      this.selectedNcfSequence = newSequence;
      this.loadNcfSequenceIntoForm(newSequence, 'edit');
      this.ncfSequenceMessage = `Secuencia ${newSequence.series} asignada correctamente.`;
      return;
    }

    this.ncfSequences = this.ncfSequences.map((sequence) =>
      sequence.id === this.selectedNcfSequence.id
        ? {
            ...sequence,
            ...form,
            companyId,
            total: this.calculateSequenceCount(form.rangeStart, form.rangeEnd),
            alert: sequence.used >= Math.max(1, Math.floor(this.calculateSequenceCount(form.rangeStart, form.rangeEnd) * 0.8))
          }
        : sequence
    );

    const updated = this.ncfSequences.find((sequence) => sequence.id === this.selectedNcfSequence.id);
    if (updated) {
      this.selectedNcfSequence = updated;
      this.loadNcfSequenceIntoForm(updated, 'edit');
      this.ncfSequenceMessage = `Secuencia ${updated.series} actualizada correctamente.`;
    }
  }

  private loadNcfCompanyIntoForm(company: NcfCompany, mode: 'create' | 'edit'): void {
    this.ncfCompanyEditorMode = mode;
    this.ncfCompanyForm = {
      rnc: company.rnc,
      legalName: company.legalName,
      tradeName: company.tradeName,
      address: company.address,
      phone: company.phone,
      email: company.email,
      status: company.status
    };
  }

  private loadNcfSequenceIntoForm(sequence: NcfSequence, mode: 'create' | 'edit'): void {
    this.ncfSequenceEditorMode = mode;
    this.ncfSequenceForm = {
      companyId: sequence.companyId,
      ncfType: sequence.ncfType,
      series: sequence.series,
      rangeStart: sequence.rangeStart,
      rangeEnd: sequence.rangeEnd,
      authorizedAt: sequence.authorizedAt,
      expiresAt: sequence.expiresAt,
      status: sequence.status
    };
  }

  private calculateSequenceCount(start: string, end: string): number {
    const startDigits = Number(start.replace(/\D/g, ''));
    const endDigits = Number(end.replace(/\D/g, ''));
    if (!startDigits || !endDigits || endDigits < startDigits) {
      return 0;
    }

    return (endDigits - startDigits) + 1;
  }

  private loadUserIntoForm(user: UserRecord, mode: 'create' | 'edit'): void {
    this.userEditorMode = mode;
    this.userForm = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      companyId: user.companyId,
      branch: user.branch,
      role: user.role,
      status: user.status
    };
  }

  selectCompany(company: Company): void {
    this.selectedCompany = company;
    this.loadCompanyIntoForm(company, 'edit');
    this.companyMessage = `Editando la empresa ${company.tradeName}.`;
  }

  startCreateCompany(): void {
    this.companyEditorMode = 'create';
    this.companyForm = this.createEmptyCompanyForm();
    this.companyMessage = 'Completa los datos para agregar una nueva empresa.';
  }

  saveCompany(): void {
    if (!this.companyForm.tradeName.trim() || !this.companyForm.rnc.trim() || !this.companyForm.email.trim()) {
      this.companyMessage = 'Completa nombre comercial, RNC y correo antes de guardar.';
      return;
    }

    if (this.companyEditorMode === 'create') {
      const company: Company = {
        id: this.nextCompanyId++,
        ...this.companyForm,
        branchCount: 1,
        lastUpdate: this.formatTimestamp()
      };
      this.companies = [company, ...this.companies];
      this.selectedCompany = company;
      this.loadCompanyIntoForm(company, 'edit');
      this.companyMessage = `Empresa ${company.tradeName} agregada correctamente.`;
      return;
    }

    this.companies = this.companies.map((company) =>
      company.id === this.selectedCompany.id
        ? {
            ...company,
            ...this.companyForm,
            lastUpdate: this.formatTimestamp()
          }
        : company
    );

    const updatedCompany = this.companies.find((company) => company.id === this.selectedCompany.id);
    if (updatedCompany) {
      this.selectedCompany = updatedCompany;
      this.loadCompanyIntoForm(updatedCompany, 'edit');
      this.companyMessage = `Empresa ${updatedCompany.tradeName} actualizada correctamente.`;
    }
  }

  toggleSelectedCompanyStatus(): void {
    const nextStatus = this.selectedCompany.status === 'Activa' ? 'Inactiva' : 'Activa';
    this.companyForm.status = nextStatus;
    this.saveCompany();
  }

  cancelCompanyEdit(): void {
    if (this.companyEditorMode === 'create') {
      this.selectCompany(this.selectedCompany);
      return;
    }

    this.loadCompanyIntoForm(this.selectedCompany, 'edit');
    this.companyMessage = `Se restauraron los datos de ${this.selectedCompany.tradeName}.`;
  }

  private loadCompanyIntoForm(company: Company, mode: CompanyEditorMode): void {
    this.companyEditorMode = mode;
    this.companyForm = {
      tradeName: company.tradeName,
      legalName: company.legalName,
      rnc: company.rnc,
      email: company.email,
      phone: company.phone,
      city: company.city,
      website: company.website,
      address: company.address,
      category: company.category,
      status: company.status
    };
  }

  private createEmptyCompanyForm(): CompanyFormModel {
    return {
      tradeName: '',
      legalName: '',
      rnc: '',
      email: '',
      phone: '',
      city: '',
      website: '',
      address: '',
      category: 'Principal',
      status: 'Activa'
    };
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private formatDateOnly(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }
}
