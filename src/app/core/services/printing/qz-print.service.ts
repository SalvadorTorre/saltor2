import { Injectable } from '@angular/core';
import * as qzModule from 'qz-tray';
import { CompanyPrintSettingsService, PrintPaper } from './company-print-settings.service';

export type PrintResult = 'qz' | 'browser' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class QzPrintService {
  private readonly qz: any = (qzModule as any).default ?? qzModule;
  private connecting: Promise<boolean> | null = null;

  constructor(private readonly companyPrintSettings: CompanyPrintSettingsService) {}

  isActive(): boolean {
    try {
      return typeof window !== 'undefined' && this.qz?.websocket?.isActive?.() === true;
    } catch {
      return false;
    }
  }

  private async connectIfAvailable(): Promise<boolean> {
    if (this.isActive()) return true;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
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

  async printHtml(html: string, title: string, popupSize = 'width=850,height=700'): Promise<PrintResult> {
    const paper = await this.companyPrintSettings.getPaper();
    const documentHtml = this.applyPaperLayout(html, paper);

    if (await this.connectIfAvailable()) {
      try {
        const printer = await this.qz.printers.getDefault();
        const config = this.qz.configs.create(printer, {
          jobName: title,
          units: 'mm',
          size: this.qzPaperSize(paper)
        });
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

  private applyPaperLayout(html: string, paper: PrintPaper): string {
    const layout = paper === '80mm'
      ? '@page{size:80mm auto;margin:3mm!important}html,body{width:74mm!important;max-width:74mm!important;margin:0!important}.print-document{width:80mm!important}'
      : paper === '90mm'
        ? '@page{size:90mm auto;margin:3mm!important}html,body{width:84mm!important;max-width:84mm!important;margin:0!important}.print-document{width:90mm!important}'
        : paper === 'media_carta'
          ? '@page{size:139.7mm 215.9mm;margin:10mm!important}html,body{width:auto!important;max-width:none!important}.print-document{width:auto!important;max-width:none!important}'
          : '@page{size:215.9mm 279.4mm;margin:12mm!important}html,body{width:auto!important;max-width:none!important}.print-document{width:auto!important;max-width:none!important}';

    return html.replace('</head>', `<style id="company-print-paper">${layout}</style></head>`);
  }
}
