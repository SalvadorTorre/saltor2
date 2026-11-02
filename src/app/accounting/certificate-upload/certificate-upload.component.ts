import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DigitalCertificateMetadata, DigitalCertificatesService } from '../../core/services/digital-certificates/digital-certificates.service';

/**
 * Certificado de firma digital de la empresa: estado, vigencia y carga/reemplazo del archivo .p12/.pfx.
 * Se usa en el Panel fiscal (la misma lógica que Configuración › Firma digital DGII).
 */
@Component({
  selector: 'app-certificate-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './certificate-upload.component.html',
  styleUrls: ['./certificate-upload.component.scss']
})
export class CertificateUploadComponent implements OnInit {
  @Output() uploaded = new EventEmitter<DigitalCertificateMetadata>();

  certificate: DigitalCertificateMetadata | null = null;
  file: File | null = null;
  password = '';
  message = '';
  isError = false;
  isLoading = false;
  isUploading = false;
  showForm = false;

  constructor(private readonly certificates: DigitalCertificatesService) {}

  ngOnInit(): void {
    void this.load();
  }

  get daysLeft(): number | null {
    if (!this.certificate) return null;
    return Math.floor((new Date(this.certificate.validUntil).getTime() - Date.now()) / 86400000);
  }

  get status(): 'none' | 'expired' | 'soon' | 'ok' {
    const days = this.daysLeft;
    if (days === null) return 'none';
    if (days < 0) return 'expired';
    if (days <= 30) return 'soon';
    return 'ok';
  }

  get statusLabel(): string {
    switch (this.status) {
      case 'none': return 'Sin certificado';
      case 'expired': return 'Vencido';
      case 'soon': return `Vence en ${this.daysLeft} días`;
      default: return 'Vigente';
    }
  }

  onFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.message = this.file ? `Archivo seleccionado: ${this.file.name}` : '';
    this.isError = false;
  }

  async upload(): Promise<void> {
    if (!this.file) { this.setMessage('Selecciona el archivo del certificado (.p12 o .pfx).', true); return; }
    if (!this.password) { this.setMessage('Escribe la contraseña del certificado.', true); return; }
    this.isUploading = true;
    try {
      this.certificate = await this.certificates.uploadCertificate(this.file, this.password);
      this.password = '';
      this.file = null;
      this.showForm = false;
      this.setMessage('Certificado validado y guardado. Ya se puede firmar y enviar e-CF con él.', false);
      this.uploaded.emit(this.certificate);
    } catch (error) {
      this.setMessage(error instanceof Error ? error.message : 'No se pudo cargar el certificado.', true);
    } finally {
      this.isUploading = false;
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeZone: 'America/Santo_Domingo' }).format(new Date(value));
  }

  private async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.certificate = await this.certificates.getCertificate();
      this.showForm = !this.certificate;
    } catch {
      this.setMessage('No se pudo consultar el certificado de la empresa.', true);
    } finally {
      this.isLoading = false;
    }
  }

  private setMessage(text: string, isError: boolean): void {
    this.message = text;
    this.isError = isError;
  }
}
