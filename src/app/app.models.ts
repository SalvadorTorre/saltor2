export interface NavigationItem {
  label: string;
  icon: string;
}

export interface ModuleItem extends NavigationItem {
  key?: string;
  children?: string[];
}

export interface Company {
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

export type CompanyFormModel = Omit<Company, 'id' | 'branchCount' | 'lastUpdate'>;

export interface UserFormModel {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  companyId: number | null;
  branch: string;
  role: string;
  status: 'Activo' | 'Inactivo';
}

export interface UserRecord extends Omit<UserFormModel, 'password'> {
  id: number;
  authUserId: string | null;
  fullName: string;
  avatar: string;
  lastUpdate: string;
}

export interface NcfCompany {
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

export interface NcfSequence {
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
  alertPercent: number;
}

export interface NcfCompanyFormModel {
  rnc: string;
  legalName: string;
  tradeName: string;
  address: string;
  phone: string;
  email: string;
  status: 'Activa' | 'Inactiva';
}
export interface NcfSequenceFormModel {
  companyId: number | null;
  ncfType: string;
  series: string;
  rangeStart: string;
  rangeEnd: string;
  authorizedAt: string;
  expiresAt: string;
  status: 'Activa' | 'Agotada' | 'Vencida';
  used: number;
  alertPercent: number;
}

export interface RncRecord {
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

export interface RncFormModel {
  rnc: string;
  legalName: string;
  tradeName: string;
  category: string;
  address: string;
  phone: string;
  email: string;
  dgiiStatus: 'Activo' | 'Suspendido' | 'Pendiente';
}

export interface ProductRecord {
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
  minimumSaleQuantity: number;
  minimumWholesaleQuantity: number;
  replacementCode: string;
  exemptItbis: boolean;
  taxValue: number;
  status: 'Activo' | 'Inactivo' | 'Agotado';
  imageUrl?: string;
}

export type ProductFormModel = Omit<ProductRecord, 'id'>;

export interface ClientRecord {
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
  category: 'Credito' | 'Contado';
  creditLimit: number;
  balance: number;
  status: 'Activo' | 'Inactivo' | 'Bloqueado';
  lastPurchase: string;
}

export type ClientFormModel = Omit<ClientRecord, 'id' | 'lastPurchase'>;

export interface SupplierRecord {
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

export type SupplierFormModel = Omit<SupplierRecord, 'id' | 'lastOrder'>;

export interface InvoiceLine {
  id: number;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceFormModel {
  customerId: number | null;
  customerName: string;
  rnc: string;
  invoiceNumber: string;
  invoiceDate: string;
  ncfType: string;
  ncf: string;
  paymentMethod: 'Contado' | 'Credito';
  notes: string;
}

export interface NcfType {
  id: number;
  code: string;
  type: number | null;
  series: string;
  name: string;
  description?: string;
  taxRate: number;
  isElectronic: boolean;
  status: 'Activa' | 'Inactiva';
  createdAt: string;
}

export interface NcfTypeFormModel {
  code: string;
  type: number;
  series: string;
  name: string;
  description: string;
  taxRate: number;
  isElectronic: boolean;
  status: 'Activa' | 'Inactiva';
}

export type ViewMode =
  | 'dashboard'
  | 'company'
  | 'users'
  | 'ncf'
  | 'ncf_type'
  | 'rnc'
  | 'settings_other'
  | 'products'
  | 'clients'
  | 'suppliers'
  | 'invoice_new'
  | 'invoice_history'
  | 'invoice_consultation'
  | 'quotation'
  | 'cash_opening'
  | 'cash_closing'
  | 'cash_movements'
  | 'accounting'
  | 'report';
