import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface DigitalCertificateMetadata {
  fileName: string;
  holder: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validUntil: string;
  uploadedAt: string;
}

interface CertificateRow {
  nombre_archivo: string;
  titular: string;
  emisor: string;
  numero_serie: string;
  valido_desde: string;
  valido_hasta: string;
  cargado_en: string;
}

@Injectable({ providedIn: 'root' })
export class DigitalCertificatesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getCertificate(): Promise<DigitalCertificateMetadata | null> {
    const { data, error } = await this.supabase.client.rpc('obtener_certificado_firma_digital');
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as CertificateRow | null;
    return row ? this.toMetadata(row) : null;
  }

  async uploadCertificate(file: File, password: string): Promise<DigitalCertificateMetadata> {
    const metadata = await this.readCertificate(file, password);
    const { data, error } = await this.supabase.client.functions.invoke('guardar-certificado-ecf', {
      body: { metadata, password, fileBase64: await this.fileToBase64(file), fileType: file.type || 'application/x-pkcs12' }
    });
    if (error) {
      const response = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (response?.json) {
        const body = await response.json();
        if (body.error) throw new Error(body.error);
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    const row = data as CertificateRow;
    return this.toMetadata(row);
  }

  private async readCertificate(file: File, password: string): Promise<DigitalCertificateMetadata> {
    if (!password) throw new Error('Indica la contraseña del certificado.');
    if (!/\.(p12|pfx)$/i.test(file.name)) {
      throw new Error('Selecciona un certificado con extensión .p12 o .pfx.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('El certificado no puede superar 5 MB.');

    try {
      const forge = await import('node-forge');
      const binary = await this.fileToBinary(file);
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binary), password);
      const certBagType = forge.pki.oids['certBag'];
      const bags = p12.getBags({ bagType: certBagType })[certBagType] ?? [];
      const certificate = bags.map((bag) => bag.cert).find((cert) => !!cert);
      if (!certificate) throw new Error('No se encontró un certificado dentro del archivo.');

      return {
        fileName: file.name,
        holder: this.commonName(certificate.subject.attributes) || this.distinguishedName(certificate.subject.attributes),
        issuer: this.commonName(certificate.issuer.attributes) || this.distinguishedName(certificate.issuer.attributes),
        serialNumber: certificate.serialNumber.match(/.{1,2}/g)?.join(':').toUpperCase() ?? certificate.serialNumber,
        validFrom: certificate.validity.notBefore.toISOString(),
        validUntil: certificate.validity.notAfter.toISOString(),
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('No se encontró')) throw error;
      throw new Error('No se pudo abrir el certificado. Verifica que el archivo y la contraseña sean correctos.');
    }
  }

  private commonName(attributes: Array<{ shortName?: string; name?: string; value?: unknown }>): string {
    const value = attributes.find((attribute) => attribute.shortName === 'CN' || attribute.name === 'commonName')?.value;
    return this.attributeValue(value);
  }

  private distinguishedName(attributes: Array<{ shortName?: string; name?: string; value?: unknown }>): string {
    return attributes.map((attribute) => `${attribute.shortName ?? attribute.name ?? 'Dato'}: ${this.attributeValue(attribute.value)}`).join(', ');
  }

  private attributeValue(value: unknown): string {
    return Array.isArray(value) ? value.map(String).join(', ') : String(value ?? '');
  }

  private async fileToBinary(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return binary;
  }

  private async fileToBase64(file: File): Promise<string> {
    return btoa(await this.fileToBinary(file));
  }

  private toMetadata(row: CertificateRow): DigitalCertificateMetadata {
    return {
      fileName: row.nombre_archivo,
      holder: row.titular,
      issuer: row.emisor,
      serialNumber: row.numero_serie,
      validFrom: row.valido_desde,
      validUntil: row.valido_hasta,
      uploadedAt: row.cargado_en
    };
  }
}
