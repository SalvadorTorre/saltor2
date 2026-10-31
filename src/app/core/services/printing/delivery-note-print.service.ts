import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CompaniesService } from '../companies/companies.service';
import { DeliveryNoteDetail, DeliveryNotesService } from '../delivery-notes/delivery-notes.service';
import { CompanyPrintSettingsService } from './company-print-settings.service';
import { QzPrintService } from './qz-print.service';

/** Impresión del conduce de despacho: media carta / carta como la factura, o ticket en 80/90 mm. */
@Injectable({ providedIn: 'root' })
export class DeliveryNotePrintService {
  constructor(
    private readonly deliveryNotes: DeliveryNotesService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly printSettings: CompanyPrintSettingsService,
    private readonly qzPrintService: QzPrintService
  ) {}

  async print(noteId: number): Promise<void> {
    const note = await this.deliveryNotes.get(noteId);
    let paper = 'carta';
    try { paper = await this.printSettings.getPaper(); } catch { /* carta por defecto */ }
    const ticket = paper === '80mm' || paper === '90mm';
    const html = ticket ? await this.ticketHtml(note, paper) : await this.letterHtml(note, paper === 'media_carta');
    await this.qzPrintService.printHtml(html, `Conduce ${note.numero}`, ticket ? undefined : 'width=1000,height=700');
    await this.deliveryNotes.markPrinted(noteId);
  }

  private async company(): Promise<{ name: string; rnc: string; address: string; phone: string; logo: string; user: string }> {
    const session = await this.auth.restoreSession();
    const company = (await this.companiesService.getCompanies()).find((item) => item.id === session?.companyId);
    return {
      name: company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM',
      rnc: company?.rnc || '',
      address: company?.address || '',
      phone: company?.phone || '',
      logo: company?.logoUrl || '',
      user: session?.fullName || ''
    };
  }

  private async letterHtml(note: DeliveryNoteDetail, halfLetter: boolean): Promise<string> {
    const e = (value: unknown) => this.escape(value);
    const c = await this.company();
    const totalQty = note.lineas.reduce((sum, line) => sum + line.cantidad, 0);
    const rows = note.lineas.map((line) =>
      `<tr><td>${e(line.codigo_producto || '')}</td><td class="desc">${e(line.descripcion)}</td><td>${e((line.unidad || 'UNIDAD').toUpperCase())}</td>`
      + `<td class="num">${this.qty(line.cantidad_documento)}</td><td class="num strong">${this.qty(line.cantidad)}</td></tr>`).join('');

    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Conduce ${e(note.numero)}</title><style>
@page{size:letter portrait;margin:0}*{box-sizing:border-box}html{margin:0;padding:0}
body{margin:0;padding:1cm;color:#111;font-family:Arial,sans-serif;font-size:10px}
.page{min-height:${halfLetter ? '4.01in' : '9in'};display:flex;flex-direction:column}
.top{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:10px;align-items:start}
.company{text-align:center;line-height:1.25}.company img{display:block;max-width:1.1in;max-height:.45in;object-fit:contain;margin:0 auto 2px}
.company .name{font-size:13px;font-weight:800}.company p{margin:0;font-size:10.5px}
.title{font-size:16px;font-weight:800;letter-spacing:3px;text-align:right;margin:0}
.info{font-family:'Courier New',monospace;font-size:10.5px;line-height:1.45;margin-top:4px}.info div{display:grid;grid-template-columns:.95in 1fr}
.info .no{font-family:Arial,sans-serif;font-size:14px;font-weight:800}
.box b{display:block;font-size:11px;margin-bottom:2px}.box div{font-family:'Courier New',monospace;font-size:10px;line-height:1.3}
.delivery{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-top:8px;border:1px solid #111;padding:5px 7px}
.delivery span{display:block;font-size:9px;color:#444}.delivery strong{font-family:'Courier New',monospace;font-size:10px}
.items{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
.items th{font-weight:400;font-size:11px;text-align:left;border-bottom:1px solid #111;padding:2px 3px}
.items td{font-family:'Courier New',monospace;font-size:9.5px;font-weight:700;padding:2px 3px;vertical-align:top}
.items td.desc{word-break:break-word;line-height:1.25}.items .num{text-align:right}.items .strong{font-size:11px}
.c-code{width:13%}.c-desc{width:51%}.c-unit{width:12%}.c-doc{width:12%}.c-qty{width:12%}
.sum{text-align:right;font-size:11px;margin-top:4px;border-top:1px solid #111;padding-top:3px}
.notes{font-size:9.5px;margin-top:5px}
.foot{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding-top:30px}
.sign{border-top:1px solid #111;padding-top:3px;text-align:center;font-size:10px}
.legend{text-align:center;font-size:8.5px;color:#444;margin-top:6px}
.void{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:60px;font-weight:800;color:rgba(200,0,0,.18);transform:rotate(-18deg)}
</style></head><body><main class="page">
${note.estado === 'Anulado' ? '<div class="void">ANULADO</div>' : ''}
<section class="top">
  <div class="box"><b>CLIENTE</b><div>${e(note.cliente_rnc || '')}</div><div>${e(note.cliente_nombre)}${note.cliente_id ? ` (${e(note.cliente_id)})` : ''}</div>${note.cliente_telefono ? `<div>${e(note.cliente_telefono)}</div>` : ''}</div>
  <div class="company">${c.logo ? `<img src="${e(c.logo)}" alt="">` : ''}<div class="name">${e(c.name)}</div><p>${e(c.address)}</p><p>${e(c.rnc)}</p><p>${e(c.phone)}</p></div>
  <div><p class="title">CONDUCE</p><div class="info">
    <div><span>No.</span><span class="no">${e(note.numero)}</span></div>
    <div><span>Fecha</span><span>${this.date(note.fecha)}</span></div>
    <div><span>${note.origen_tipo === 'Factura' ? 'Factura' : 'Orden'}</span><span>${e(note.numero_origen)}</span></div>
    <div><span>Despachó</span><span>${e(note.usuario_nombre || c.user)}</span></div>
  </div></div>
</section>
<section class="delivery">
  <div><span>Dirección de entrega</span><strong>${e(note.direccion_entrega || 'N/D')}</strong></div>
  <div><span>Chofer</span><strong>${e(note.chofer || '—')}</strong></div>
  <div><span>Vehículo / placa</span><strong>${e(note.vehiculo || '—')}</strong></div>
</section>
<table class="items"><colgroup><col class="c-code"><col class="c-desc"><col class="c-unit"><col class="c-doc"><col class="c-qty"></colgroup>
<thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th class="num">Cant. doc.</th><th class="num">Despachado</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="sum">Total de artículos despachados: <b>${this.qty(totalQty)}</b></div>
${note.notas ? `<div class="notes"><b>Notas:</b> ${e(note.notas)}</div>` : ''}
<section class="foot"><div class="sign">Despachado por</div><div class="sign">Chofer</div><div class="sign">Recibido conforme (nombre y cédula)</div></section>
<div class="legend">Documento de despacho. No es un comprobante fiscal.</div>
</main><script>window.onload=function(){window.print();};<\/script></body></html>`;
  }

  private async ticketHtml(note: DeliveryNoteDetail, paper: string): Promise<string> {
    const e = (value: unknown) => this.escape(value);
    const c = await this.company();
    const rows = note.lineas.map((line) => `<tr><td>${e(line.descripcion)}<small>${e(line.codigo_producto || '')} · ${e((line.unidad || 'UNIDAD').toUpperCase())}</small></td><td class="num">${this.qty(line.cantidad)}</td></tr>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Conduce ${e(note.numero)}</title><style>
@page{size:${paper === '90mm' ? '90mm' : '80mm'} auto;margin:3mm}body{font:11px Arial;margin:0;color:#111}
.head{text-align:center}.head img{display:block;max-width:42mm;max-height:22mm;margin:0 auto 4px;object-fit:contain}.name{font-size:14px;font-weight:800}
.type{border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:5px 0;text-align:center;font-size:13px;font-weight:800}
.line{line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:6px}th{border-bottom:1px dashed #777;text-align:left;font-size:10px;padding:3px 0}
td{font-size:10px;padding:3px 0;vertical-align:top}td small{display:block;color:#555;font-size:9px}.num{text-align:right;width:22%;font-weight:700}
.sign{margin-top:16mm;border-top:1px solid #111;text-align:center;padding-top:2px}.legend{text-align:center;font-size:9px;margin-top:6px}
</style></head><body><div class="head">${c.logo ? `<img src="${e(c.logo)}" alt="">` : ''}<div class="name">${e(c.name)}</div><div>RNC: ${e(c.rnc || 'N/D')}</div><div>${e(c.address)}</div><div>Tel.: ${e(c.phone)}</div></div>
<div class="type">CONDUCE DE DESPACHO${note.estado === 'Anulado' ? ' · ANULADO' : ''}</div>
<div class="line"><b>No.:</b> ${e(note.numero)}<br><b>Fecha:</b> ${this.date(note.fecha)}<br><b>${note.origen_tipo === 'Factura' ? 'Factura' : 'Orden'}:</b> ${e(note.numero_origen)}<br>
<b>Cliente:</b> ${e(note.cliente_nombre)}<br><b>Teléfono:</b> ${e(note.cliente_telefono || 'N/D')}<br><b>Entregar en:</b> ${e(note.direccion_entrega || 'N/D')}<br>
<b>Chofer:</b> ${e(note.chofer || '—')} &nbsp; <b>Vehículo:</b> ${e(note.vehiculo || '—')}</div>
<table><thead><tr><th>DESCRIPCIÓN</th><th class="num">CANT.</th></tr></thead><tbody>${rows}</tbody></table>
${note.notas ? `<p><b>Notas:</b> ${e(note.notas)}</p>` : ''}
<div class="sign">Recibido conforme</div><div class="legend">No es un comprobante fiscal.</div>
<script>window.onload=function(){window.print();};<\/script></body></html>`;
  }

  private qty(value: number): string {
    return Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private date(value: string): string {
    return value ? new Intl.DateTimeFormat('es-DO').format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '';
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
  }
}
