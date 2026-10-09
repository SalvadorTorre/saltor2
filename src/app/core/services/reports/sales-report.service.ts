import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface SalesReportRow {
  invoiceId: number;
  invoiceNumber: string;
  date: string;
  product: string;
  client: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceHeaderRow { id: number; numero_factura: string | null; fecha_factura: string; cliente_nombre: string | null; estado: string | null; }
interface InvoiceDetailRow { factura_id: number; producto_id: number | null; descripcion: string | null; cantidad: number | string | null; precio_unitario: number | string | null; total_linea: number | string | null; }
interface ProductCategoryRow { id: number; categoria: string | null; }

@Injectable({ providedIn: 'root' })
export class SalesReportService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSales(dateFrom = '', dateTo = ''): Promise<SalesReportRow[]> {
    let query = this.supabase.client.from('facturas').select('id, numero_factura, fecha_factura, cliente_nombre, estado')
      .order('fecha_factura', { ascending: false }).order('id', { ascending: false });
    if (dateFrom) query = query.gte('fecha_factura', dateFrom);
    if (dateTo) query = query.lte('fecha_factura', dateTo);
    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) throw invoicesError;

    const activeInvoices = ((invoices ?? []) as InvoiceHeaderRow[]).filter((invoice) => invoice.estado !== 'Anulada');
    const invoiceIds = activeInvoices.map((invoice) => invoice.id);
    if (!invoiceIds.length) return [];

    const { data: details, error: detailsError } = await this.supabase.client.from('factura_detalles')
      .select('factura_id, producto_id, descripcion, cantidad, precio_unitario, total_linea').in('factura_id', invoiceIds);
    if (detailsError) throw detailsError;
    const detailRows = (details ?? []) as InvoiceDetailRow[];
    const productIds = [...new Set(detailRows.map((detail) => detail.producto_id).filter((id): id is number => Number.isFinite(id)))];
    const categories = new Map<number, string>();
    if (productIds.length) {
      const { data: products, error: productsError } = await this.supabase.client.from('products').select('id, categoria').in('id', productIds);
      if (productsError) throw productsError;
      (products ?? []).forEach((product: ProductCategoryRow) => categories.set(product.id, product.categoria?.trim() || 'Sin categoría'));
    }

    const invoiceById = new Map(activeInvoices.map((invoice) => [invoice.id, invoice]));
    return detailRows.map((detail) => {
      const invoice = invoiceById.get(detail.factura_id);
      return {
        invoiceId: detail.factura_id, invoiceNumber: invoice?.numero_factura ?? String(detail.factura_id), date: invoice?.fecha_factura ?? '',
        product: detail.descripcion?.trim() || 'Producto sin descripción', client: invoice?.cliente_nombre?.trim() || 'Cliente contado',
        category: detail.producto_id ? categories.get(detail.producto_id) ?? 'Sin categoría' : 'Sin categoría',
        quantity: Number(detail.cantidad ?? 0), unitPrice: Number(detail.precio_unitario ?? 0), total: Number(detail.total_linea ?? 0)
      };
    });
  }
}
