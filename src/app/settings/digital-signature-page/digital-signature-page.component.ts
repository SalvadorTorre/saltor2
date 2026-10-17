import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DigitalCertificateMetadata, DigitalCertificatesService } from '../../core/services/digital-certificates/digital-certificates.service';
import { EcfConfigService, EcfConfiguration } from '../../core/services/ecf/ecf-config.service';

/** Configuración → Firma Digital DGII: certificado de la empresa y servicio e-CF. */
@Component({
  selector: 'app-digital-signature-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './digital-signature-page.component.html',
  styleUrls: ['./digital-signature-page.component.scss']
})
export class DigitalSignaturePageComponent implements OnInit {
  certificateMessage = 'Carga el certificado de firma digital para consultar su titular y vigencia.';
  certificatePassword = '';
  selectedCertificateFile: File | null = null;
  certificateMetadata: DigitalCertificateMetadata | null = null;
  isLoadingCertificate = false;
  isUploadingCertificate = false;
  ecfConfiguration: EcfConfiguration = { ambiente: 'TEST', url_base: 'https://ecf-propio.tail2c2b0a.ts.net/', tipo_ingreso: '01', persistir_certificado: true };
  ecfMessage = '';

  constructor(
    private readonly digitalCertificatesService: DigitalCertificatesService,
    private readonly ecfConfigService: EcfConfigService
  ) {}

  ngOnInit(): void {
    void this.loadCertificate();
    void this.loadEcfConfiguration();
  }

  get certificateIsExpired(): boolean {
    return !!this.certificateMetadata && new Date(this.certificateMetadata.validUntil) < new Date();
  }

  onCertificateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedCertificateFile = input.files?.[0] ?? null;
    this.certificateMessage = this.selectedCertificateFile
      ? `Archivo seleccionado: ${this.selectedCertificateFile.name}`
      : 'Selecciona un certificado .p12 o .pfx.';
  }

  async uploadCertificate(): Promise<void> {
    if (!this.selectedCertificateFile) {
      this.certificateMessage = 'Selecciona el archivo del certificado antes de cargarlo.';
      return;
    }
    this.isUploadingCertificate = true;
    try {
      this.certificateMetadata = await this.digitalCertificatesService.uploadCertificate(this.selectedCertificateFile, this.certificatePassword);
      this.certificatePassword = '';
      this.selectedCertificateFile = null;
      this.certificateMessage = 'Certificado validado. Su clave quedó guardada de forma protegida para los envíos e-CF.';
    } catch (error) {
      this.certificateMessage = error instanceof Error ? error.message : 'No se pudo cargar el certificado.';
    } finally {
      this.isUploadingCertificate = false;
    }
  }

  async saveEcfConfiguration(): Promise<void> {
    try { await this.ecfConfigService.save(this.ecfConfiguration); this.ecfMessage = 'Configuración e-CF guardada correctamente.'; }
    catch { this.ecfMessage = 'No se pudo guardar la configuración e-CF.'; }
  }

  formatCertificateDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date(value));
  }

  private async loadCertificate(): Promise<void> {
    this.isLoadingCertificate = true;
    try {
      this.certificateMetadata = await this.digitalCertificatesService.getCertificate();
      if (this.certificateMetadata) this.certificateMessage = 'Certificado de firma digital cargado.';
    } catch {
      this.certificateMessage = 'No se pudo consultar el certificado de firma digital.';
    } finally {
      this.isLoadingCertificate = false;
    }
  }

  private async loadEcfConfiguration(): Promise<void> {
    try { const value = await this.ecfConfigService.get(); if (value) this.ecfConfiguration = value; }
    catch { this.ecfMessage = 'No se pudo consultar la configuración e-CF.'; }
  }
}
