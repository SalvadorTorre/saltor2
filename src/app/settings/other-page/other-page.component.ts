import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { DigitalCertificateMetadata, DigitalCertificatesService } from '../../core/services/digital-certificates/digital-certificates.service';
import { EcfConfigService, EcfConfiguration } from '../../core/services/ecf/ecf-config.service';

export interface OtherPreferences {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: 'claro' | 'oscuro' | 'sistema';
  language: string;
  timezone: string;
  decimalSeparator: string;
  thousandSeparator: string;
  defaultPageSize: number;
  enableNotifications: boolean;
  enableSounds: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  companyLogoUrl: string;
  printFooterText: string;
  defaultNcfType: string;
  defaultPaymentMethod: string;
}

@Component({
  selector: 'app-settings-other-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './other-page.component.html',
  styleUrls: ['./other-page.component.scss']
})
export class SettingsOtherPageComponent implements OnInit {
  activeView = 'settings_other';
  otherMessage = 'Personaliza colores, moneda, formato fecha, tema y preferencias generales del sistema.';
  certificateMessage = 'Carga el certificado de firma digital para consultar su titular y vigencia.';
  certificatePassword = '';
  selectedCertificateFile: File | null = null;
  certificateMetadata: DigitalCertificateMetadata | null = null;
  isLoadingCertificate = false;
  isUploadingCertificate = false;
  ecfConfiguration: EcfConfiguration = { ambiente: 'TEST', url_base: 'https://ecf-propio.tail2c2b0a.ts.net/ecf', tipo_ingreso: '01', persistir_certificado: true };
  ecfMessage = '';

  readonly currencyOptions = [
    { code: 'DOP', name: 'Peso Dominicano (RD$)', symbol: 'RD$' },
    { code: 'USD', name: 'Dolar Estadounidense (US$)', symbol: 'US$' },
    { code: 'EUR', name: 'Euro (€)', symbol: '€' }
  ];

  readonly dateFormatOptions = [
    { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy (23/08/2026)' },
    { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy (08/23/2026)' },
    { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd (2026-08-23)' },
    { value: 'dd MMM yyyy', label: 'dd MMM yyyy (23 Ago 2026)' }
  ];

  readonly themeOptions = [
    { value: 'claro', label: 'Claro' },
    { value: 'oscuro', label: 'Oscuro' },
    { value: 'sistema', label: 'Seguir sistema' }
  ];

  readonly languageOptions = [
    { code: 'es-DO', name: 'Espanol (Republica Dominicana)' },
    { code: 'es-ES', name: 'Espanol (Espana)' },
    { code: 'en-US', name: 'English (US)' }
  ];

  readonly timezoneOptions = [
    { value: 'America/Santo_Domingo', label: 'Santo Domingo (GMT-4)' },
    { value: 'America/New_York', label: 'Nueva York (GMT-4)' },
    { value: 'Europe/Madrid', label: 'Madrid (GMT+2)' }
  ];

  readonly pageSizeOptions = [10, 25, 50, 100];

  preferences: OtherPreferences = {
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    accentColor: '#14b8a6',
    backgroundColor: '#f8fafc',
    currency: 'DOP',
    currencySymbol: 'RD$',
    dateFormat: 'dd/MM/yyyy',
    theme: 'claro',
    language: 'es-DO',
    timezone: 'America/Santo_Domingo',
    decimalSeparator: '.',
    thousandSeparator: ',',
    defaultPageSize: 25,
    enableNotifications: true,
    enableSounds: false,
    autoSave: true,
    autoSaveInterval: 30,
    companyLogoUrl: 'assets/logosaltor.jpg',
    printFooterText: 'Gracias por su preferencia',
    defaultNcfType: '02 - Consumo',
    defaultPaymentMethod: 'Contado'
  };

  private originalPreferences: OtherPreferences = { ...this.preferences };

  readonly moduleCategory = 'Configuracion';
  readonly moduleTitle = 'Otros';
  readonly moduleDescription = 'Modulo independiente para parametros generales y opciones adicionales del sistema.';
  readonly modulePill = 'Modulo Otros';
  readonly maintenanceLinks = [
    { label: 'Productos', icon: 'box' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ];

  constructor(
    public data: AppDataService,
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
      this.certificateMetadata = await this.digitalCertificatesService.uploadCertificate(
        this.selectedCertificateFile,
        this.certificatePassword
      );
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
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date(value));
  }

  saveOtherSettings(): void {
    this.originalPreferences = { ...this.preferences };
    this.otherMessage = `Preferencias guardadas correctamente el ${this.formatTimestamp()}.`;
  }

  resetOtherSettings(): void {
    this.preferences = { ...this.originalPreferences };
    this.otherMessage = 'Preferencias restauradas a los ultimos valores guardados.';
  }

  restoreDefaultSettings(): void {
    this.preferences = {
      primaryColor: '#2563eb',
      secondaryColor: '#64748b',
      accentColor: '#14b8a6',
      backgroundColor: '#f8fafc',
      currency: 'DOP',
      currencySymbol: 'RD$',
      dateFormat: 'dd/MM/yyyy',
      theme: 'claro',
      language: 'es-DO',
      timezone: 'America/Santo_Domingo',
      decimalSeparator: '.',
      thousandSeparator: ',',
      defaultPageSize: 25,
      enableNotifications: true,
      enableSounds: false,
      autoSave: true,
      autoSaveInterval: 30,
      companyLogoUrl: 'assets/logosaltor.jpg',
      printFooterText: 'Gracias por su preferencia',
      defaultNcfType: '02 - Consumo',
      defaultPaymentMethod: 'Contado'
    };
    this.otherMessage = 'Preferencias restauradas a valores por defecto. Recuerda guardar los cambios.';
  }

  updateCurrencySymbol(): void {
    const match = this.currencyOptions.find((c) => c.code === this.preferences.currency);
    if (match) {
      this.preferences.currencySymbol = match.symbol;
    }
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private async loadCertificate(): Promise<void> {
    this.isLoadingCertificate = true;
    try {
      this.certificateMetadata = await this.digitalCertificatesService.getCertificate();
      if (this.certificateMetadata) {
        this.certificateMessage = 'Certificado de firma digital cargado.';
      }
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
