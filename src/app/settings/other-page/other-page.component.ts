import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AppDataService } from '../../app-data.service';
import { CompanyPrintSettingsService, PrintPaper } from '../../core/services/printing/company-print-settings.service';
import { BillingMode, CompanyBillingModeService } from '../../core/services/printing/company-billing-mode.service';
import { DisplayPreferencesService, DisplayProfile } from '../../core/services/display-preferences/display-preferences.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';

type QzOs = 'windows' | 'mac' | 'linux';

interface QzInstaller {
  os: QzOs;
  label: string;
  detail: string;
  fileName: string;
  sizeMb: number;
}

/** Versión de QZ Tray que corresponde a la librería qz-tray del sistema. */
const QZ_TRAY_VERSION = '2.3.0';
const QZ_TRAY_RELEASE_URL = `https://github.com/qzind/tray/releases/download/v${QZ_TRAY_VERSION}/`;

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
  printPaper: PrintPaper;
  useWindowsDefaultPrinter: boolean;
  printerName: string;
  billingMode: BillingMode;
  displayProfile: DisplayProfile;
}

@Component({
  selector: 'app-settings-other-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './other-page.component.html',
  styleUrls: ['./other-page.component.scss']
})
export class SettingsOtherPageComponent implements OnInit, OnDestroy {
  otherMessage = 'Personaliza colores, moneda, formato fecha, tema y preferencias generales del sistema.';

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

  readonly displayProfileOptions: Array<{ value: DisplayProfile; label: string; description: string }> = [
    { value: 'auto', label: 'Automatico', description: 'Usa el tamaño disponible del navegador.' },
    { value: '1366x768', label: '1360 x 768', description: 'Optimiza espacios, tablas y formularios para pantallas HD.' },
    { value: '1440x900', label: '1440 x 900', description: 'Distribución equilibrada para pantallas de escritorio.' },
    { value: '1920x1080', label: '1920 x 1080', description: 'Aprovecha pantallas Full HD.' }
  ];

  readonly qzVersion = QZ_TRAY_VERSION;
  readonly qzInstallers: QzInstaller[] = [
    { os: 'windows', label: 'Windows', detail: '64 bits (Intel / AMD)', fileName: `qz-tray-${QZ_TRAY_VERSION}-x86_64.exe`, sizeMb: 134 },
    { os: 'windows', label: 'Windows', detail: 'ARM64', fileName: `qz-tray-${QZ_TRAY_VERSION}-arm64.exe`, sizeMb: 131 },
    { os: 'mac', label: 'macOS', detail: 'Apple Silicon (M1/M2/M3)', fileName: `qz-tray-${QZ_TRAY_VERSION}-arm64.pkg`, sizeMb: 133 },
    { os: 'mac', label: 'macOS', detail: 'Intel', fileName: `qz-tray-${QZ_TRAY_VERSION}-x86_64.pkg`, sizeMb: 137 },
    { os: 'linux', label: 'Linux', detail: '64 bits (Intel / AMD)', fileName: `qz-tray-${QZ_TRAY_VERSION}-x86_64.run`, sizeMb: 151 }
  ];
  readonly detectedOs: QzOs | null = this.detectOs();
  qzStatus: 'checking' | 'active' | 'inactive' = 'checking';
  availablePrinters: string[] = [];
  loadingPrinters = false;

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
    defaultPaymentMethod: 'Contado',
    printPaper: 'carta',
    useWindowsDefaultPrinter: true,
    printerName: '',
    billingMode: 'Directo',
    displayProfile: 'auto'
  };

  private originalPreferences: OtherPreferences = { ...this.preferences };

  readonly moduleCategory = 'Configuracion';
  readonly moduleTitle = 'Otros';
  readonly moduleDescription = 'Modulo independiente para parametros generales y opciones adicionales del sistema.';
  readonly modulePill = 'Modulo Otros';

  constructor(
    public data: AppDataService,
    private readonly companyPrintSettings: CompanyPrintSettingsService,
    private readonly billingModeService: CompanyBillingModeService,
    private readonly displayPreferences: DisplayPreferencesService,
    private readonly qzPrint: QzPrintService
  ) {}

  ngOnInit(): void {
    void this.loadPrintPaper();
    void this.checkQzTray();
    const printerPreference = this.qzPrint.getPrinterPreference();
    this.preferences.useWindowsDefaultPrinter = printerPreference.useWindowsDefault;
    this.preferences.printerName = printerPreference.printerName;
    this.preferences.displayProfile = this.displayPreferences.getProfile();
    this.preferences.theme = this.displayPreferences.getTheme();
    this.originalPreferences = { ...this.preferences };
  }

  get displayProfileDescription(): string {
    return this.displayProfileOptions.find((profile) => profile.value === this.preferences.displayProfile)?.description ?? '';
  }

  async saveOtherSettings(): Promise<void> {
    // Preferencias de este equipo: siempre se guardan.
    this.displayPreferences.save(this.preferences.displayProfile);
    this.displayPreferences.saveTheme(this.preferences.theme);

    if (!this.preferences.useWindowsDefaultPrinter && !this.preferences.printerName) {
      this.otherMessage = 'Selecciona una impresora o elige usar la predeterminada de Windows.';
      await Swal.fire({ icon: 'warning', title: 'Impresora requerida', text: this.otherMessage });
      return;
    }
    this.qzPrint.savePrinterPreference({
      useWindowsDefault: this.preferences.useWindowsDefaultPrinter,
      printerName: this.preferences.printerName
    });

    // Datos de la empresa: solo si cambiaron (y solo un administrador puede).
    const problems: string[] = [];
    if (this.preferences.printPaper !== this.originalPreferences.printPaper) {
      try { await this.companyPrintSettings.savePaper(this.preferences.printPaper); }
      catch (error) { problems.push(error instanceof Error ? error.message : 'No se pudo guardar el tipo de papel.'); this.preferences.printPaper = this.originalPreferences.printPaper; }
    }
    if (this.preferences.billingMode !== this.originalPreferences.billingMode) {
      try { await this.billingModeService.saveMode(this.preferences.billingMode); }
      catch (error) { problems.push(error instanceof Error ? error.message : 'No se pudo guardar el modo de facturación.'); this.preferences.billingMode = this.originalPreferences.billingMode; }
    }

    this.originalPreferences = { ...this.preferences };
    if (problems.length) {
      this.otherMessage = problems.join(' ');
      await Swal.fire({ icon: 'warning', title: 'Se guardó solo una parte', text: `El tema y la pantalla se guardaron. ${problems.join(' ')}` });
      return;
    }
    this.otherMessage = `Preferencias guardadas correctamente el ${this.formatTimestamp()}.`;
    void Swal.fire({ icon: 'success', title: 'Cambios guardados', text: this.preferences.billingMode === 'Caja' ? 'Recarga la página (F5) para ver Caja → Cobro de facturas.' : '', timer: 2200, showConfirmButton: false });
  }

  resetOtherSettings(): void {
    this.preferences = { ...this.originalPreferences };
    this.displayPreferences.apply(this.preferences.displayProfile);
    this.displayPreferences.applyTheme(this.preferences.theme);
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
      defaultPaymentMethod: 'Contado',
      printPaper: 'carta',
      useWindowsDefaultPrinter: true,
      printerName: '',
      billingMode: this.preferences.billingMode,
      displayProfile: 'auto'
    };
    this.displayPreferences.apply(this.preferences.displayProfile);
    this.displayPreferences.applyTheme(this.preferences.theme);
    this.otherMessage = 'Preferencias restauradas a valores por defecto. Recuerda guardar los cambios.';
  }

  /** Si sale sin guardar, vuelve el tema guardado. */
  ngOnDestroy(): void {
    this.displayPreferences.applyTheme(this.displayPreferences.getTheme());
  }

  /** Muestra el tema al elegirlo; se conserva al guardar. */
  previewTheme(): void {
    this.displayPreferences.applyTheme(this.preferences.theme);
  }

  previewDisplayProfile(): void {
    this.displayPreferences.apply(this.preferences.displayProfile);
  }

  updateCurrencySymbol(): void {
    const match = this.currencyOptions.find((c) => c.code === this.preferences.currency);
    if (match) {
      this.preferences.currencySymbol = match.symbol;
    }
  }

  preparingQzSetup = false;
  qzSetupMessage = '';

  /**
   * Genera un instalador para Windows que instala QZ Tray (si falta), copia el
   * certificado de SaltorSystem como override.crt y reinicia QZ Tray. Así QZ
   * confía en el sistema y deja marcar "Allow" + "Remember".
   */
  async downloadQzSetup(): Promise<void> {
    this.preparingQzSetup = true;
    this.qzSetupMessage = '';
    try {
      const certificate = (await this.qzPrint.getCertificate()).replace(/\r\n/g, '\n').trim() + '\n';
      const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(certificate)));
      const x64 = QZ_TRAY_RELEASE_URL + `qz-tray-${QZ_TRAY_VERSION}-x86_64.exe`;
      const arm = QZ_TRAY_RELEASE_URL + `qz-tray-${QZ_TRAY_VERSION}-arm64.exe`;
      const script = [
        '@echo off',
        'setlocal',
        'title SaltorSystem - Instalar QZ Tray',
        'net session >nul 2>&1',
        'if errorlevel 1 (',
        '  echo Solicitando permisos de administrador...',
        `  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
        '  exit /b',
        ')',
        'set "QZDIR=%ProgramFiles%\\QZ Tray"',
        'set "QZEXE=%QZDIR%\\qz-tray.exe"',
        `set "QZURL=${x64}"`,
        `if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "QZURL=${arm}"`,
        'if not exist "%QZEXE%" (',
        `  echo Descargando QZ Tray ${QZ_TRAY_VERSION} ^(unos 130 MB^)...`,
        '  curl.exe -L --fail -o "%TEMP%\\qz-tray-setup.exe" "%QZURL%"',
        '  if errorlevel 1 ( echo No se pudo descargar QZ Tray. Revisa el internet. & pause & exit /b 1 )',
        '  echo Instalando QZ Tray...',
        '  start /wait "" "%TEMP%\\qz-tray-setup.exe" /S',
        '  del "%TEMP%\\qz-tray-setup.exe" >nul 2>&1',
        ')',
        'if not exist "%QZDIR%" ( echo QZ Tray no quedo instalado. & pause & exit /b 1 )',
        'echo Instalando el certificado de SaltorSystem...',
        `powershell -NoProfile -Command "[IO.File]::WriteAllBytes('%QZDIR%\\override.crt', [Convert]::FromBase64String('${base64}'))"`,
        'if errorlevel 1 ( echo No se pudo copiar el certificado. & pause & exit /b 1 )',
        'echo Reiniciando QZ Tray...',
        'taskkill /F /IM qz-tray.exe >nul 2>&1',
        'taskkill /F /IM qz-tray-console.exe >nul 2>&1',
        'timeout /t 3 /nobreak >nul',
        'start "" "%QZEXE%"',
        'echo.',
        'echo Listo. Vuelve a SaltorSystem, recarga la pagina y pulsa "Comprobar de nuevo".',
        'echo Si QZ Tray pregunta, marca "Remember this decision" y pulsa "Allow".',
        'pause',
        ''
      ].join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([script], { type: 'application/octet-stream' }));
      link.download = 'instalar-qz-saltorsystem.cmd';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      this.qzSetupMessage = 'Descargado. Ábrelo en este equipo y acepta los permisos de administrador.';
    } catch (error) {
      this.qzSetupMessage = 'No se pudo preparar el instalador: ' + String((error as { message?: string })?.message ?? error);
    } finally {
      this.preparingQzSetup = false;
    }
  }

  qzDownloadUrl(installer: QzInstaller): string {
    return QZ_TRAY_RELEASE_URL + installer.fileName;
  }

  /** El primer instalador del sistema operativo de este equipo es el recomendado. */
  isRecommendedQz(installer: QzInstaller): boolean {
    return installer === this.qzInstallers.find((item) => item.os === this.detectedOs);
  }

  async checkQzTray(): Promise<void> {
    this.qzStatus = 'checking';
    this.qzStatus = (await this.qzPrint.checkConnection()) ? 'active' : 'inactive';
    if (this.qzStatus === 'active') await this.loadAvailablePrinters();
  }

  async loadAvailablePrinters(): Promise<void> {
    this.loadingPrinters = true;
    try {
      this.availablePrinters = await this.qzPrint.getAvailablePrinters();
      if (!this.availablePrinters.length) this.otherMessage = 'QZ Tray está activo, pero no encontró impresoras instaladas en este equipo.';
    } finally {
      this.loadingPrinters = false;
    }
  }

  private detectOs(): QzOs | null {
    if (typeof navigator === 'undefined') return null;
    const platform = `${(navigator as any).userAgentData?.platform ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
    if (platform.includes('win')) return 'windows';
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('linux') && !platform.includes('android')) return 'linux';
    return null;
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private async loadPrintPaper(): Promise<void> {
    try {
      this.preferences.printPaper = await this.companyPrintSettings.getPaper();
      this.preferences.billingMode = await this.billingModeService.getMode();
      this.originalPreferences = { ...this.preferences };
    } catch {
      this.otherMessage = 'No se pudo cargar el tipo de papel de la empresa.';
    }
  }
}
