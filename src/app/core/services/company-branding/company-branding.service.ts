import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CompaniesService } from '../companies/companies.service';

const CACHE_PREFIX = 'saltor.companyLogo.';

/** Logo de la empresa activa: se muestra en la barra superior y en documentos impresos. */
@Injectable({ providedIn: 'root' })
export class CompanyBrandingService {
  private readonly logoSubject = new BehaviorSubject<string | null>(null);
  readonly logo$ = this.logoSubject.asObservable();
  private companyId: number | null = null;

  constructor(private readonly companies: CompaniesService) {}

  get logo(): string | null { return this.logoSubject.value; }

  async load(companyId: number | null | undefined): Promise<void> {
    if (!companyId) { this.companyId = null; this.logoSubject.next(null); return; }
    this.companyId = companyId;
    // Muestra primero el guardado en este equipo y luego confirma con la base.
    this.logoSubject.next(this.readCache(companyId));
    try {
      const logo = await this.companies.getLogo(companyId);
      if (this.companyId !== companyId) return;
      this.writeCache(companyId, logo);
      this.logoSubject.next(logo);
    } catch { /* Sin conexión: se queda con el guardado. */ }
  }

  /** Avisa que el logo de una empresa cambió (desde la pantalla Empresa). */
  update(companyId: number, logo: string | null): void {
    this.writeCache(companyId, logo);
    if (companyId === this.companyId) this.logoSubject.next(logo);
  }

  private readCache(companyId: number): string | null {
    try { return localStorage.getItem(CACHE_PREFIX + companyId); } catch { return null; }
  }
  private writeCache(companyId: number, logo: string | null): void {
    try { logo ? localStorage.setItem(CACHE_PREFIX + companyId, logo) : localStorage.removeItem(CACHE_PREFIX + companyId); } catch { /* almacenamiento lleno o bloqueado */ }
  }
}

/** Convierte una imagen elegida por el usuario en un PNG de máximo 400 px (data URL). */
export async function imageFileToLogo(file: File, maxSize = 400): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error('Elige una imagen PNG, JPG o WEBP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen es muy grande (máximo 8 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      image.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/png');
    // Fotos grandes: JPEG pesa mucho menos.
    if (data.length > 500000) data = canvas.toDataURL('image/jpeg', 0.85);
    if (data.length > 690000) throw new Error('La imagen sigue siendo muy pesada; usa una más simple.');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
