import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import Swal from 'sweetalert2';
import { CashCollectionPageComponent } from './cash-collection-page.component';
import { PendingCollectionInvoice } from '../../core/services/invoices/invoices.service';

describe('Caja: consumo como proforma', () => {
  let component: CashCollectionPageComponent;
  let invoices: any; let ecf: any; let print: any;
  const invoice = (): PendingCollectionInvoice => ({ id: 5, number: 'F005', date: '2026-10-19', createdAt: '2026-10-19T12:00:00Z', customerId: null, customerName: 'Cliente', rnc: '', ncfType: 'E32', condition: 'Contado', subtotal: 100, tax: 18, total: 118, seller: 'Vendedor' });
  const signed = { id: 5, numero_factura: 'F005', dgii_estado: 'Firmada', ecf_queue_status: 'FIRMADA', ecf_xml_firmado: '<ECF>firmado</ECF>', ncf: 'E320000000123', codSeguridad: 'SEC123', qr_link: 'https://qr', fec_firma: '2026-10-19T16:30:00Z' };
  beforeEach(() => {
    TestBed.configureTestingModule({});
    spyOn(Swal, 'fire').and.resolveTo({ isConfirmed: true, isDenied: false, isDismissed: false });
    invoices = { collectInvoice: jasmine.createSpy('collectInvoice').and.resolveTo({ id: 5, numero_factura: 'F005', tipo_ncf: 'E332' }), getPendingCollection: jasmine.createSpy('getPendingCollection').and.resolveTo([]) };
    ecf = { sendInvoice: jasmine.createSpy('sendInvoice').and.resolveTo(signed), updates$: new Subject() };
    print = { print: jasmine.createSpy('print').and.resolveTo(undefined) };
    component = TestBed.runInInjectionContext(() => new CashCollectionPageComponent(invoices, {} as any, print, ecf, { restoreSession: async () => ({ branchId: 1 }) } as any, {} as any));
    component.selected = invoice(); component.received = 118;
  });

  it('usa el tipo E332 devuelto por el cobro y firma antes de imprimir', async () => {
    const order: string[] = [];
    invoices.collectInvoice.and.callFake(async () => { order.push('cobrar y convertir'); return { id: 5, tipo_ncf: 'E332' }; });
    ecf.sendInvoice.and.callFake(async () => { order.push('firmar'); return signed; });
    print.print.and.callFake(async () => { order.push('imprimir'); });
    await component.collect();
    expect(order).toEqual(['cobrar y convertir', 'firmar', 'imprimir']);
    expect(ecf.sendInvoice).toHaveBeenCalledOnceWith(5);
    expect(print.print).toHaveBeenCalledOnceWith(5, 'Vendedor');
    expect(component.selected).toBeNull();
  });

  it('espera el XML firmado antes de imprimir y evita doble cobro', async () => {
    let finish!: (result: any) => void;
    ecf.sendInvoice.and.returnValue(new Promise(resolve => finish = resolve));
    const work = component.collect();
    await Promise.resolve();
    expect(print.print).not.toHaveBeenCalled();
    await component.collect();
    expect(invoices.collectInvoice.calls.count()).toBe(1);
    finish(signed); await work;
    expect(print.print.calls.count()).toBe(1);
  });

  it('si la conversión falla no firma ni imprime', async () => {
    invoices.collectInvoice.and.rejectWith(new Error('Proforma desactivada'));
    await component.collect();
    expect(ecf.sendInvoice).not.toHaveBeenCalled(); expect(print.print).not.toHaveBeenCalled();
  });

  it('no imprime una proforma si falta el XML aunque el estado diga Firmada', async () => {
    ecf.sendInvoice.and.resolveTo({ ...signed, ecf_xml_firmado: null });
    await component.collect();
    expect(print.print).not.toHaveBeenCalled();
    expect(invoices.collectInvoice.calls.count()).toBe(1);
  });

  it('una firma fallida conserva el cobro sin imprimir una factura incompleta', async () => {
    ecf.sendInvoice.and.rejectWith(new Error('No se pudo firmar'));
    await component.collect();
    expect(print.print).not.toHaveBeenCalled();
    expect(component.isWorking).toBeFalse();
  });

  it('sin proforma activa conserva E32 y solicita el XML por la cola fiscal', async () => {
    invoices.collectInvoice.and.resolveTo({ id: 5, tipo_ncf: 'E32' });
    ecf.sendInvoice.and.resolveTo({ ...signed, dgii_estado: 'En cola', ecf_queue_status: 'EN_COLA', ecf_xml_firmado: '<ECF/>' });
    await component.collect();
    expect(ecf.sendInvoice).toHaveBeenCalledOnceWith(5);
    expect(print.print).not.toHaveBeenCalled();
  });

  it('E31 sigue en cola y no imprime como si ya estuviera aceptada', async () => {
    invoices.collectInvoice.and.resolveTo({ id: 5, tipo_ncf: 'E31' });
    ecf.sendInvoice.and.resolveTo({ ...signed, dgii_estado: 'En cola', ecf_queue_status: 'EN_COLA', ecf_xml_firmado: '<ECF/>' });
    await component.collect();
    expect(ecf.sendInvoice.calls.count()).toBe(1);
    expect(print.print).not.toHaveBeenCalled();
  });
});
