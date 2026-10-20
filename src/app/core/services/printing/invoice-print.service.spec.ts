import { InvoicePrintService } from './invoice-print.service';

describe('Impresión de proforma firmada', () => {
  it('imprime identificación, detalle, QR, código y fecha real de firma', async () => {
    const detail = { number: 'F005', ncf: 'E320000000123', ncfType: 'E332', invoiceDate: '2026-10-19', customerName: 'Cliente <ejemplo>', rnc: '', customerAddress: 'Dirección', customerPhone: '8090000000', paymentMethod: 'Contado', notes: 'Nota especial', subtotal: 100, taxTotal: 18, grandTotal: 118, securityCode: 'SEC123', qrLink: 'https://qr.example/123', dgiiSentAt: 'HORA-DE-SOLICITUD', signatureDate: '2026-10-19T16:30:00Z', signedXml: '<ECF/>', lines: [{ quantity: 1, unitPrice: 118, taxRate: 18, taxAmount: 18, description: 'Producto', lineTotal: 118 }] };
    const invoices: any = { getInvoiceForEditing: async () => detail, markInvoicePrinted: jasmine.createSpy('mark').and.resolveTo(undefined) };
    const printer: any = { printHtml: jasmine.createSpy('printHtml').and.resolveTo('printed') };
    const service = new InvoicePrintService(invoices, { restoreSession: async () => ({ companyId: 1, fullName: 'Cajera' }) } as any, { getCompanies: async () => [{ id: 1, legalName: 'Empresa', rnc: '101000001' }] } as any, printer);
    const codes = spyOn<any>(service, 'createFiscalCodes').and.resolveTo({ qr: 'data:image/png;base64,QR', barcode: 'data:image/png;base64,BAR' });
    await service.print(5, 'Vendedor');
    const html = printer.printHtml.calls.mostRecent().args[0] as string;
    for (const value of ['Factura PROFORMA','E320000000123','SEC123','2026-10-19T16:30:00Z','Producto','Cliente &lt;ejemplo&gt;','Vendedor','118.00','Nota especial','Contado','data:image/png;base64,QR']) expect(html).toContain(value);
    expect(html).not.toContain('HORA-DE-SOLICITUD');
    expect(codes).toHaveBeenCalledWith('https://qr.example/123','F005');
    expect(invoices.markInvoicePrinted).toHaveBeenCalledOnceWith(5);
  });
});
