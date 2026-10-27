import { Injectable } from '@angular/core';
import { ProductFormModel, ProductRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';
import { ilikeAnyColumn } from '../../utils/postgrest-filters';

interface ProductRow {
  id: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  categoria: string;
  ubicacion: string | null;
  marca: string | null;
  tipo: string | null;
  tamano: string | null;
  existencia: number | string | null;
  existenciamin: number | string | null;
  costo: number | string | null;
  precio_venta: number | string | null;
  precio_minimo: number | string | null;
  ventaxmayor: 'S' | 'N' | null;
  precio_mayor: number | string | null;
  cantidadminventa: number | string | null;
  cantidadxmayor: number | string | null;
  reemplazo: 'S' | 'N' | null;
  codigo_reemplazo: string | null;
  exento_itbis: boolean | null;
  valor_impuesto: number | string | null;
  estado: 'Activo' | 'Inactivo' | 'Agotado';
  url_imagen: string | null;
}

export interface ProductEntryRecord {
  id: number;
  code: string;
  supplierId: number | null;
  supplierName: string;
  date: string;
  reference: string;
  purchaseOrder: string;
  supplierInvoiceDate: string;
  userCode: string;
  userName: string;
  notes: string;
  lines: ProductEntryLine[];
}

export interface ProductEntryLine {
  id: number;
  productId: number;
  productCode: string;
  productDescription: string;
  quantity: number;
  unitCost: number;
}

export interface ProductEntryPayload {
  supplierId: number;
  date: string;
  reference: string;
  purchaseOrder: string;
  supplierInvoiceDate: string;
  userCode: string;
  userName: string;
  notes: string;
  lines: Array<{ productId: number; quantity: number; unitCost: number }>;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly table = 'products';

  constructor(private readonly supabase: SupabaseService) {}

  async getProducts(): Promise<ProductRecord[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: ProductRow) => this.fromRow(row));
  }

  async searchProducts(search: string): Promise<ProductRecord[]> {
    const term = search.trim();
    if (!term) return [];
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .neq('estado', 'Inactivo')
      .or(ilikeAnyColumn(['codigo', 'descripcion'], term))
      .order('descripcion', { ascending: true })
        .limit(50);
    if (error) throw error;
    return (data ?? []).map((row: ProductRow) => this.fromRow(row));
  }

  /**
   * Confirma que los productos siguen visibles para la empresa de la sesión.
   * La validación se hace justo antes de registrar movimientos de inventario.
   */
  async getProductsByIds(ids: number[]): Promise<ProductRecord[]> {
    const productIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!productIds.length) return [];

    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .in('id', productIds);

    if (error) throw error;
    return (data ?? []).map((row: ProductRow) => this.fromRow(row));
  }

  async createProduct(form: ProductFormModel): Promise<ProductRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toRow(form))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as ProductRow);
  }

  async updateProduct(id: number, form: ProductFormModel): Promise<ProductRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toUpdateRow(form))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as ProductRow);
  }

  async deleteProduct(id: number): Promise<void> {
    const { error } = await this.supabase.client
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  async getEntries(): Promise<ProductEntryRecord[]> {
    const { data: headers, error: headersError } = await this.supabase.client
      .from('product_entry_headers')
      .select('id, codigo, suplidor_id, fecha, referencia, orden_compra, fecha_factura_suplidor, codigo_usuario, nombre_usuario, notas, suplidor:suplidores(nombre_comercial)')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });

    if (headersError) throw headersError;
    const entryIds = (headers ?? []).map((header: any) => Number(header.id));
    if (!entryIds.length) return [];

    const { data: lines, error: linesError } = await this.supabase.client
      .from('product_entries')
      .select('id, entrada_id, producto_id, cantidad, costo_unitario, producto:products(codigo, descripcion)')
      .in('entrada_id', entryIds)
      .order('id', { ascending: true });
    if (linesError) throw linesError;

    const linesByEntry = new Map<number, ProductEntryLine[]>();
    (lines ?? []).forEach((line: any) => {
      const entryId = Number(line.entrada_id);
      const entryLines = linesByEntry.get(entryId) ?? [];
      entryLines.push({
        id: Number(line.id),
        productId: Number(line.producto_id),
        productCode: line.producto?.codigo ?? '',
        productDescription: line.producto?.descripcion ?? 'Producto no disponible',
        quantity: Number(line.cantidad),
        unitCost: Number(line.costo_unitario)
      });
      linesByEntry.set(entryId, entryLines);
    });

    return (headers ?? []).map((header: any) => ({
      id: Number(header.id),
      code: header.codigo,
      supplierId: header.suplidor_id === null ? null : Number(header.suplidor_id),
      supplierName: header.suplidor?.nombre_comercial ?? 'Sin suplidor',
      date: header.fecha,
      reference: header.referencia ?? '',
      purchaseOrder: header.orden_compra ?? '',
      supplierInvoiceDate: header.fecha_factura_suplidor ?? '',
      userCode: header.codigo_usuario ?? '',
      userName: header.nombre_usuario ?? '',
      notes: header.notas ?? '',
      lines: linesByEntry.get(Number(header.id)) ?? []
    }));
  }

  async createEntry(payload: ProductEntryPayload): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('crear_entrada_productos', this.toEntryPayload(payload));
    if (error) throw error;
    return Number(data);
  }

  async updateEntry(entryId: number, payload: ProductEntryPayload): Promise<void> {
    const { error } = await this.supabase.client.rpc('actualizar_entrada_productos', {
      p_entrada_id: entryId,
      ...this.toEntryPayload(payload)
    });
    if (error) throw error;
  }

  async registerEntry(productId: number, supplierId: number | null, date: string, quantity: number, cost: number, reference: string, notes: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('registrar_entrada_producto', {
      p_producto_id: productId,
      p_suplidor_id: supplierId,
      p_fecha: date,
      p_cantidad: quantity,
      p_costo_unitario: cost,
      p_referencia: reference,
      p_notas: notes
    });

    if (error) throw error;
  }

  async deleteEntry(id: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('eliminar_entrada_productos', { p_entrada_id: id });
    if (error) throw error;
  }

  private fromRow(row: ProductRow): ProductRecord {
    return {
      id: row.id,
      code: row.codigo,
      description: row.descripcion,
      unit: row.unidad,
      category: row.categoria,
      location: row.ubicacion ?? '',
      brand: row.marca ?? '',
      type: row.tipo ?? '',
      size: row.tamano ?? '',
      stock: Number(row.existencia ?? 0),
      minimumStock: Number(row.existenciamin ?? 0),
      cost: Number(row.costo ?? 0),
      salePrice: Number(row.precio_venta ?? 0),
      minimumPrice: Number(row.precio_minimo ?? 0),
      wholesaleEnabled: row.ventaxmayor === 'S',
      wholesalePrice: Number(row.precio_mayor ?? 0),
      minimumSaleQuantity: Number(row.cantidadminventa ?? 1),
      minimumWholesaleQuantity: Number(row.cantidadxmayor ?? 0),
      replacementEnabled: row.reemplazo === 'S',
      replacementCode: row.codigo_reemplazo ?? '',
      exemptItbis: Boolean(row.exento_itbis),
      taxValue: Number(row.valor_impuesto ?? 0),
      status: row.estado,
      imageUrl: row.url_imagen ?? undefined
    };
  }

  /**
   * Al editar no se envía la existencia: solo cambia por ventas, entradas o
   * ajustes (queda en el kardex).  Enviarla pisaba las ventas hechas mientras
   * el formulario estaba abierto.
   */
  private toUpdateRow(form: ProductFormModel): Omit<ProductRow, 'id' | 'existencia'> {
    const { existencia: _stock, ...row } = this.toRow(form);
    return row;
  }

  private toRow(form: ProductFormModel): Omit<ProductRow, 'id'> {
    return {
      codigo: form.code.trim(),
      descripcion: form.description.trim(),
      unidad: form.unit.trim() || 'Unidad',
      categoria: form.category.trim() || 'General',
      ubicacion: form.location.trim() || null,
      marca: form.brand.trim() || null,
      tipo: form.type.trim() || null,
      tamano: form.size.trim() || null,
      existencia: Number(form.stock || 0),
      existenciamin: Number(form.minimumStock || 0),
      costo: Number(form.cost || 0),
      precio_venta: Number(form.salePrice || 0),
      precio_minimo: Number(form.minimumPrice || 0),
      ventaxmayor: form.wholesaleEnabled ? 'S' : 'N',
      precio_mayor: form.wholesaleEnabled ? Number(form.wholesalePrice || 0) : 0,
      cantidadminventa: Math.max(1, Number(form.minimumSaleQuantity || 1)),
      cantidadxmayor: form.wholesaleEnabled ? Number(form.minimumWholesaleQuantity || 0) : 0,
      reemplazo: form.replacementEnabled ? 'S' : 'N',
      codigo_reemplazo: form.replacementEnabled ? form.replacementCode.trim() || null : null,
      exento_itbis: Boolean(form.exemptItbis),
      valor_impuesto: Number(form.taxValue || 0),
      estado: form.status,
      url_imagen: form.imageUrl?.trim() || null
    };
  }

  private toEntryPayload(payload: ProductEntryPayload): Record<string, unknown> {
    return {
      p_suplidor_id: payload.supplierId,
      p_fecha: payload.date,
      p_referencia: payload.reference,
      p_orden_compra: payload.purchaseOrder,
      p_fecha_factura_suplidor: payload.supplierInvoiceDate || null,
      p_codigo_usuario: payload.userCode,
      p_nombre_usuario: payload.userName,
      p_notas: payload.notes,
      p_lineas: payload.lines.map((line) => ({
        producto_id: line.productId,
        cantidad: line.quantity,
        costo_unitario: line.unitCost
      }))
    };
  }
}
