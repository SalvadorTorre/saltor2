import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Quotation, QuotationLine, QuotationsService } from '../../core/services/quotations/quotations.service';

@Component({ selector: 'app-quotation-page', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './quotation-page.component.html', styleUrls: ['./quotation-page.component.scss'] })
export class QuotationPageComponent implements OnInit {
  tab: 'create' | 'consult' = 'create'; editingId: number | null = null; message = ''; quotes: Quotation[] = []; search = '';
  quote = this.emptyQuote();
  constructor(private readonly quotations: QuotationsService) {}
  ngOnInit(): void { void this.load(); }
  emptyQuote() { return { number: '', date: new Date().toISOString().slice(0, 10), validUntil: '', customer: '', rnc: '', phone: '', email: '', address: '', notes: '', lines: [{ code: '', description: '', quantity: 1, price: 0, itbis: 18 } as Omit<QuotationLine, 'total'>] }; }
  get subtotal() { return this.quote.lines.reduce((sum, line) => sum + line.quantity * line.price, 0); }
  get tax() { return this.quote.lines.reduce((sum, line) => sum + line.quantity * line.price * line.itbis / 100, 0); }
  get total() { return this.subtotal + this.tax; }
  get filtered() { const value = this.search.toLowerCase().trim(); return value ? this.quotes.filter((q) => [q.number, q.customer, q.rnc].join(' ').toLowerCase().includes(value)) : this.quotes; }
  addLine() { this.quote.lines.push({ code: '', description: '', quantity: 1, price: 0, itbis: 18 }); }
  removeLine(index: number) { if (this.quote.lines.length > 1) this.quote.lines.splice(index, 1); }
  reset() { this.quote = this.emptyQuote(); this.editingId = null; this.message = ''; }
  async load() { try { this.quotes = await this.quotations.list(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones.'; } }
  private payload(): Omit<Quotation, 'id' | 'number' | 'status'> { return { date: this.quote.date, validUntil: this.quote.validUntil, customer: this.quote.customer.trim(), rnc: this.quote.rnc.trim(), phone: this.quote.phone.trim(), email: this.quote.email.trim(), address: this.quote.address.trim(), notes: this.quote.notes.trim(), subtotal: this.subtotal, itbis: this.tax, total: this.total, lines: this.quote.lines.map((line) => ({ ...line, code: line.code.trim(), description: line.description.trim(), quantity: Number(line.quantity), price: Number(line.price), itbis: Number(line.itbis), total: Number(line.quantity) * Number(line.price) * (1 + Number(line.itbis) / 100) })) }; }
  async save() { if (!this.quote.customer.trim() || this.quote.lines.some((line) => !line.description.trim() || line.quantity <= 0)) { this.message = 'Completa el cliente y todos los detalles antes de guardar.'; return; } try { const payload = this.payload(); if (this.editingId) { if (!window.confirm('Se reemplazarán las líneas actuales de la cotización. ¿Deseas guardar los cambios?')) return; await this.quotations.update(this.editingId, payload); this.message = 'Cotización actualizada correctamente.'; } else { const saved = await this.quotations.create(payload); this.message = `Cotización ${saved.number} creada correctamente.`; this.editingId = saved.id; } await this.load(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo guardar la cotización.'; } }
  async edit(item: Quotation) { const detail = await this.quotations.get(item.id); if (!detail) return; this.editingId = detail.id; this.quote = { number: detail.number, date: detail.date, validUntil: detail.validUntil, customer: detail.customer, rnc: detail.rnc, phone: detail.phone, email: detail.email, address: detail.address, notes: detail.notes, lines: detail.lines.map(({ total, ...line }) => line) }; this.tab = 'create'; this.message = `Editando ${detail.number}.`; }
  async print(item: Quotation) {
    const q = await this.quotations.get(item.id);
    if (!q) return;
    const rows = q.lines.map((line) => `<tr><td>${this.e(line.description)}</td><td>${line.quantity}</td><td>RD$${line.price.toFixed(2)}</td><td>RD$${line.total.toFixed(2)}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=850,height=700');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cotización ${this.e(q.number)}</title><style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }
      body { color:#102b55; font:14px Arial,sans-serif; margin:0; }
      .print-document { min-height:0; overflow:visible; padding:12mm; width:100%; }
      header { border-bottom:2px solid #1769ee; display:flex; justify-content:space-between; padding-bottom:12px; }
      h1 { margin:0; } table { border-collapse:collapse; margin-top:20px; width:100%; }
      thead { display:table-header-group; }
      th,td { border:1px solid #cbd5e1; padding:8px; text-align:left; } th { background:#eff6ff; }
      .total { margin:20px 0 0 auto; width:250px; }
      .total p { border-bottom:1px solid #cbd5e1; margin:0; padding:7px 0; } .total h2 { margin:12px 0 0; }
      @media print { html,body,.print-document { height:auto !important; min-height:0 !important; overflow:visible !important; } table,thead,tbody,tr,td,.total { break-before:auto; break-after:auto; break-inside:auto; page-break-before:auto; page-break-after:auto; page-break-inside:auto; } }
    </style></head><body><main class="print-document"><header><h1>Cotización ${this.e(q.number)}</h1><div>Fecha: ${q.date}<br>Válida hasta: ${q.validUntil || 'N/D'}</div></header><p><b>Cliente:</b> ${this.e(q.customer)}<br><b>RNC:</b> ${this.e(q.rnc)}</p><table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><p>Subtotal: RD$${q.subtotal.toFixed(2)}</p><p>ITBIS: RD$${q.itbis.toFixed(2)}</p><h2>Total: RD$${q.total.toFixed(2)}</h2></div></main><script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`);
    win.document.close();
  }
  async pdf(item: Quotation) { const q = await this.quotations.get(item.id); if (!q) return; const { jsPDF } = await import('jspdf'); const doc = new jsPDF({ unit: 'mm', format: 'letter' }); let y = 18; const write = (text: string, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); const lines = doc.splitTextToSize(text, 170); doc.text(lines, 20, y); y += lines.length * 6 + 3; }; write(`COTIZACIÓN ${q.number}`, true); write(`Fecha: ${q.date}    Válida hasta: ${q.validUntil || 'N/D'}`); write(`Cliente: ${q.customer}`); q.lines.forEach((l) => write(`${l.quantity} x ${l.description} - RD$${l.total.toFixed(2)}`)); write(`TOTAL: RD$${q.total.toFixed(2)}`, true); doc.save(`cotizacion-${q.number}.pdf`); }
  private e(value: string) { return String(value || '').replace(/[&<>'\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c)); }
}
