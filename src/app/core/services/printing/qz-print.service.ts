import { Injectable } from '@angular/core';
import * as qzModule from 'qz-tray';
import { CompanyPrintSettingsService, PrintPaper } from './company-print-settings.service';
import { SupabaseService } from '../supabase/supabase.service';

export type PrintResult = 'qz' | 'browser' | 'unavailable';

export interface PrinterPreference {
  useWindowsDefault: boolean;
  printerName: string;
}

const PRINTER_PREFERENCE_KEY = 'saltor.print.printer-preference';

@Injectable({ providedIn: 'root' })
export class QzPrintService {
  private readonly qz: any = (qzModule as any).default ?? qzModule;
  private connecting: Promise<boolean> | null = null;
  private signingConfigured = false;

  constructor(
    private readonly companyPrintSettings: CompanyPrintSettingsService,
    private readonly supabase: SupabaseService
  ) {}

  isActive(): boolean {
    try {
      return typeof window !== 'undefined' && this.qz?.websocket?.isActive?.() === true;
    } catch {
      return false;
    }
  }

  /** Intenta conectar con QZ Tray en este equipo e indica si está funcionando. */
  checkConnection(): Promise<boolean> {
    return this.connectIfAvailable();
  }

  getPrinterPreference(): PrinterPreference {
    try {
      const value = localStorage.getItem(PRINTER_PREFERENCE_KEY);
      if (!value) return { useWindowsDefault: true, printerName: '' };
      const saved = JSON.parse(value) as Partial<PrinterPreference>;
      return {
        useWindowsDefault: saved.useWindowsDefault !== false,
        printerName: typeof saved.printerName === 'string' ? saved.printerName : ''
      };
    } catch {
      return { useWindowsDefault: true, printerName: '' };
    }
  }

  savePrinterPreference(preference: PrinterPreference): void {
    localStorage.setItem(PRINTER_PREFERENCE_KEY, JSON.stringify({
      useWindowsDefault: preference.useWindowsDefault,
      printerName: preference.useWindowsDefault ? '' : preference.printerName.trim()
    }));
  }

  async getAvailablePrinters(): Promise<string[]> {
    if (!(await this.connectIfAvailable())) return [];
    try {
      const printers = await this.qz.printers.find();
      return Array.isArray(printers) ? printers.map(String).sort((a, b) => a.localeCompare(b, 'es')) : [];
    } catch {
      return [];
    }
  }

  private async connectIfAvailable(): Promise<boolean> {
    if (this.isActive()) return true;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        // QZ Tray puede imprimir con una autorización manual mientras se habilita
        // la firma del certificado. No se debe regresar al navegador por eso.
        try {
          await this.configureSigning();
        } catch {
          // La conexión continúa; QZ Tray solicitará autorización si es necesario.
        }
        await Promise.race([
          this.qz.websocket.connect({ retries: 0, delay: 0 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('QZ Tray no respondió')), 1800))
        ]);
        return this.isActive();
      } catch {
        return false;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  private async configureSigning(): Promise<void> {
    if (this.signingConfigured || !this.qz?.security) return;
    const { data, error } = await this.supabase.client.functions.invoke('qz-sign', { body: { action: 'certificate' } });
    if (error || !data?.certificate) throw error ?? new Error('No se recibió el certificado de QZ Tray.');

    this.qz.security.setCertificatePromise((resolve: (certificate: string) => void) => resolve(data.certificate));
    this.qz.security.setSignatureAlgorithm?.('SHA512');
    this.qz.security.setSignaturePromise((toSign: string) => (resolve: (signature: string) => void, reject: (error: Error) => void) => {
      this.supabase.client.functions.invoke('qz-sign', { body: { toSign } })
        .then(({ data: response, error: signingError }: any) => {
          if (signingError || !response?.signature) reject(signingError ?? new Error('No se recibió la firma de QZ Tray.'));
          else resolve(response.signature);
        })
        .catch(reject);
    });
    this.signingConfigured = true;
  }

  async printHtml(html: string, title: string, popupSize = 'width=850,height=700'): Promise<PrintResult> {
    const paper = await this.companyPrintSettings.getPaper();
    const documentHtml = this.applyPaperLayout(html, paper);

    if (await this.connectIfAvailable()) {
      try {
        const preference = this.getPrinterPreference();
        const printer = preference.useWindowsDefault || !preference.printerName
          ? await this.qz.printers.getDefault()
          : preference.printerName;
        if (!printer) throw new Error('No hay una impresora predeterminada configurada en Windows.');

        // El tipo de papel configurado puede ser 80 mm aunque el usuario cambie
        // temporalmente a una impresora convencional. En ese caso no debemos
        // enviarle un rollo de 80 mm: el controlador de Windows decide su papel.
        const configOptions: Record<string, unknown> = { jobName: title };
        if (this.isThermalPrinter(printer) && (paper === '80mm' || paper === '90mm')) {
          configOptions['units'] = 'mm';
          configOptions['size'] = this.qzPaperSize(paper);
        }
        const config = this.qz.configs.create(printer, configOptions);
        await this.qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: documentHtml.replace(/<script[\s\S]*?<\/script>/gi, '') }]);
        return 'qz';
      } catch {
        // A live tray without an available default printer still falls back to browser printing.
      }
    }

    const fallback = typeof window === 'undefined' ? null : window.open('', '_blank', popupSize);
    if (!fallback) return 'unavailable';
    fallback.document.title = title;
    fallback.document.open();
    fallback.document.write(documentHtml);
    fallback.document.close();
    return 'browser';
  }

  private qzPaperSize(paper: PrintPaper): { width: number; height: number | null; custom?: boolean } {
    switch (paper) {
      case '80mm': return { width: 80, height: null, custom: true };
      case '90mm': return { width: 90, height: null, custom: true };
      case 'media_carta': return { width: 139.7, height: 215.9, custom: true };
      default: return { width: 215.9, height: 279.4, custom: true };
    }
  }

  private isThermalPrinter(printer: string): boolean {
    return /(?:\bpos\b|thermal|t[eé]rmica|(?:^|\D)(?:80|90)\s*(?:mm)?\b|epson\s*tm|xprinter|bixolon|zebra|rongta|gprinter|star\s*micronics)/i.test(printer);
  }

  private applyPaperLayout(html: string, paper: PrintPaper): string {
    const layout = paper === '80mm'
      ? '@page{size:80mm auto;margin:3mm!important}html,body{width:74mm!important;max-width:74mm!important;margin:0!important}.print-document{width:80mm!important}'
      : paper === '90mm'
        ? '@page{size:90mm auto;margin:3mm!important}html,body{width:84mm!important;max-width:84mm!important;margin:0!important}.print-document{width:90mm!important}'
        : paper === 'media_carta'
          // Cada documento define su orientación para media carta. Forzar aquí
          // 139.7 mm de ancho recortaba documentos horizontales, como cotizaciones.
          ? 'html,body{width:auto!important;max-width:none!important}.print-document{width:auto!important;max-width:none!important}'
          : '@page{size:215.9mm 279.4mm;margin:12mm!important}html,body{width:auto!important;max-width:none!important}.print-document{width:auto!important;max-width:none!important}';

    return html.replace('</head>', `<style id="company-print-paper">${layout}</style></head>`);
  }
}
