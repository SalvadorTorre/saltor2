import { Injectable } from '@angular/core';
import { ProductFormModel, ProductRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

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
  existencia_minima: number | string | null;
  costo: number | string | null;
  precio_venta: number | string | null;
  precio_minimo: number | string | null;
  precio_mayor: number | string | null;
  cantidad_minima_venta: number | string | null;
  cantidad_minima_mayor: number | string | null;
  codigo_reemplazo: string | null;
  exento_itbis: boolean | null;
  valor_impuesto: number | string | null;
  estado: 'Activo' | 'Inactivo' | 'Agotado';
  url_imagen: string | null;
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
      .update(this.toRow(form))
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
      minimumStock: Number(row.existencia_minima ?? 0),
      cost: Number(row.costo ?? 0),
      salePrice: Number(row.precio_venta ?? 0),
      minimumPrice: Number(row.precio_minimo ?? 0),
      wholesalePrice: Number(row.precio_mayor ?? 0),
      minimumSaleQuantity: Number(row.cantidad_minima_venta ?? 1),
      minimumWholesaleQuantity: Number(row.cantidad_minima_mayor ?? 0),
      replacementCode: row.codigo_reemplazo ?? '',
      exemptItbis: Boolean(row.exento_itbis),
      taxValue: Number(row.valor_impuesto ?? 0),
      status: row.estado,
      imageUrl: row.url_imagen ?? undefined
    };
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
      existencia_minima: Number(form.minimumStock || 0),
      costo: Number(form.cost || 0),
      precio_venta: Number(form.salePrice || 0),
      precio_minimo: Number(form.minimumPrice || 0),
      precio_mayor: Number(form.wholesalePrice || 0),
      cantidad_minima_venta: Math.max(1, Number(form.minimumSaleQuantity || 1)),
      cantidad_minima_mayor: Number(form.minimumWholesaleQuantity || 0),
      codigo_reemplazo: form.replacementCode.trim() || null,
      exento_itbis: Boolean(form.exemptItbis),
      valor_impuesto: Number(form.taxValue || 0),
      estado: form.status,
      url_imagen: form.imageUrl?.trim() || null
    };
  }
}
