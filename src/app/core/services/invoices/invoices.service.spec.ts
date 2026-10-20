import { InvoicesService } from './invoices.service';

describe('Datos de firma para consulta e impresión', () => {
  it('recupera XML, código, QR y fecha de firma sin confundirla con fecha de envío', async () => {
    const invoice: any = { id: 1, numero_factura: 'F001', tipo_ncf: 'E332', ncf: 'E320000000101', fec_firma: '2026-10-19T16:30:00Z', dgii_enviado_en: '2026-10-19T16:29:00Z', ecf_xml_firmado: '<ECF>firmado</ECF>', codSeguridad: 'SEC123', qr_link: 'https://qr', subtotal: 100, itbis: 18, total: 118 };
    const query: any = { select: jasmine.createSpy('select').and.callFake(() => query), eq: () => query, single: async () => ({ data: invoice }), order: async () => ({ data: [] }) };
    const service = new InvoicesService({ client: { from: () => query } } as any);
    const detail = await service.getInvoiceForEditing(1);
    expect(detail.signatureDate).toBe('2026-10-19T16:30:00Z');
    expect(detail.dgiiSentAt).toBe('2026-10-19T16:29:00Z');
    expect(detail.signedXml).toBe('<ECF>firmado</ECF>');
    expect(detail.securityCode).toBe('SEC123'); expect(detail.qrLink).toBe('https://qr');
  });

  it('cobra mediante la operación que devuelve el tipo persistido en el servidor', async () => {
    const rpc = jasmine.createSpy('rpc').and.resolveTo({ data: [{ id: 5, numero_factura: 'F005', tipo_ncf: 'E332' }] });
    const service = new InvoicesService({ client: { rpc } } as any);
    expect((await service.collectInvoice(5,1)).tipo_ncf).toBe('E332');
    expect(rpc).toHaveBeenCalledOnceWith('cobrar_factura_caja_proforma', { p_factura_id: 5, p_forma_pago_codigo: 1 });
  });
});
