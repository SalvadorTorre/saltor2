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
  /** Vendedor que hizo la factura. */
  seller: string;
  /** Venta de la línea con ITBIS incluido (para la utilidad). */
  netTotal: number;
  /** Costo de la línea con ITBIS incluido (costo del producto al momento de vender). */
  cost: number;
}

interface InvoiceHeaderRow { id: number; numero_factura: string | null; fecha_factura: string; cliente_nombre: string | null; estado: string | null; usuario_nombre: string | null; }
interface InvoiceDetailRow {
  factura_id: number; producto_id: number | null; producto_inventario_id: number | null; descripcion: string | null; cantidad: number | string | null;
  precio_unitario: number | string | null; total_linea: number | string | null; monto_itbis: number | string | null; tasa_itbis: number | string | null;
  costo_unitario: number | string | null;
}
interface ProductCategoryRow { id: number; categoria: string | null; costo: number | string | null; valor_impuesto: number | string | null; exento_itbis: boolean | null; }

@Injectable({ providedIn: 'root' })
export class SalesReportService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSales(dateFrom = '', dateTo = ''): Promise<SalesReportRow[]> {
    let query = this.supabase.client.from('facturas').select('id, numero_factura, fecha_factura, cliente_nombre, estado, usuario_nombre')
      .order('fecha_factura', { ascending: false }).order('id', { ascending: false });
    if (dateFrom) query = query.gte('fecha_factura', dateFrom);
    if (dateTo) query = query.lte('fecha_factura', dateTo);
    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) throw invoicesError;

    const activeInvoices = ((invoices ?? []) as InvoiceHeaderRow[]).filter((invoice) => invoice.estado !== 'Anulada');
    const invoiceIds = activeInvoices.map((invoice) => invoice.id);
    if (!invoiceIds.length) return [];

    const { data: details, error: detailsError } = await this.supabase.client.from('factura_detalles')
      .select('factura_id, producto_id, producto_inventario_id, descripcion, cantidad, precio_unitario, total_linea, monto_itbis, tasa_itbis, costo_unitario').in('factura_id', invoiceIds);
    if (detailsError) throw detailsError;
    const detailRows = (details ?? []) as InvoiceDetailRow[];
    const productIds = [...new Set(detailRows.flatMap((detail) => [detail.producto_id, detail.producto_inventario_id])
      .filter((id): id is number => Number.isFinite(id)))];
    const categories = new Map<number, string>();
    const productInfo = new Map<number, ProductCategoryRow>();
    if (productIds.length) {
      const { data: products, error: productsError } = await this.supabase.client.from('products')
        .select('id, categoria, costo, valor_impuesto, exento_itbis').in('id', productIds);
      if (productsError) throw productsError;
      (products ?? []).forEach((product: ProductCategoryRow) => {
        categories.set(product.id, product.categoria?.trim() || 'Sin categoría');
        productInfo.set(product.id, product);
      });
    }

    // El precio y el costo se guardan con ITBIS incluido y la utilidad se calcula así, con ITBIS.
    const lineCost = (detail: InvoiceDetailRow): number => {
      const product = productInfo.get(detail.producto_inventario_id ?? detail.producto_id ?? -1) ?? productInfo.get(detail.producto_id ?? -1);
      const unitCost = detail.costo_unitario != null ? Number(detail.costo_unitario) : Number(product?.costo ?? 0);
      return Number(detail.cantidad ?? 0) * unitCost;
    };

    const invoiceById = new Map(activeInvoices.map((invoice) => [invoice.id, invoice]));
    return detailRows.map((detail) => {
      const invoice = invoiceById.get(detail.factura_id);
      return {
        invoiceId: detail.factura_id, invoiceNumber: invoice?.numero_factura ?? String(detail.factura_id), date: invoice?.fecha_factura ?? '',
        product: detail.descripcion?.trim() || 'Producto sin descripción', client: invoice?.cliente_nombre?.trim() || 'Cliente contado',
        category: detail.producto_id ? categories.get(detail.producto_id) ?? 'Sin categoría' : 'Sin categoría',
        quantity: Number(detail.cantidad ?? 0), unitPrice: Number(detail.precio_unitario ?? 0), total: Number(detail.total_linea ?? 0),
        seller: invoice?.usuario_nombre?.trim() || 'Sin vendedor',
        netTotal: Number(detail.total_linea ?? 0),
        cost: lineCost(detail)
      };
    });
  }
}
