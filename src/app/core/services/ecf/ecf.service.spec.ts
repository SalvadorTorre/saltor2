import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { EcfService } from './ecf.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('EcfService cola', () => {
  let invoke: jasmine.Spy;
  let from: jasmine.Spy;
  let service: EcfService;
  const queued = { id: 1, numero_factura: 'F001', encf: 'E310000000001', ncf: 'E310000000001', dgii_estado: 'En cola', ecf_queue_status: 'EN_COLA', ecf_operation_id: 'queue-1' };
  beforeEach(() => {
    invoke = jasmine.createSpy('invoke');
    from = jasmine.createSpy('from');
    service = new EcfService({ client: { functions: { invoke }, from } } as unknown as SupabaseService);
  });
  afterEach(() => service.stopTracking());

  it('consulta cada cuatro segundos y termina con aceptación', fakeAsync(() => {
    invoke.and.callFake((name: string) => Promise.resolve({ data: name === 'enviar-ecf' || invoke.calls.count() < 3 ? queued : { ...queued, dgii_estado: 'Aceptado', ecf_queue_status: 'ACEPTADO', dgii_track_id: 'dgii-2' }, error: null }));
    const updates: string[] = [];
    service.updates$.subscribe(event => updates.push(event.result.dgii_estado!));
    void service.sendInvoice(1); flushMicrotasks();
    tick(3999); expect(invoke.calls.count()).toBe(1);
    tick(1); flushMicrotasks(); expect(invoke.calls.count()).toBe(2);
    expect(invoke.calls.mostRecent().args).toEqual(['consultar-operacion-ecf', { body: { kind: 'FACTURA', documentId: 1 } }]);
    tick(4000); flushMicrotasks();
    tick(16000); expect(invoke.calls.count()).toBe(3);
    expect(updates).toEqual(['En cola', 'En cola', 'Aceptado']);
  }));

  it('no solapa consultas cuando una respuesta tarda', fakeAsync(() => {
    let finish!: (value: unknown) => void;
    invoke.and.callFake((name: string) => name === 'enviar-ecf' ? Promise.resolve({ data: queued }) : new Promise(resolve => finish = resolve));
    void service.sendInvoice(1); flushMicrotasks(); tick(20000);
    expect(invoke.calls.count()).toBe(2);
    finish({ data: { ...queued, ecf_queue_status: 'ACEPTADO', dgii_estado: 'Aceptado' } });
    flushMicrotasks(); tick(8000); expect(invoke.calls.count()).toBe(2);
  }));

  it('un fallo transitorio de consulta mantiene seguimiento sin repetir POST', fakeAsync(() => {
    invoke.and.callFake((name: string) => Promise.resolve(name === 'enviar-ecf' ? { data: queued } : { error: new Error('HTTP 502') }));
    void service.sendInvoice(1); flushMicrotasks(); tick(8000); flushMicrotasks();
    expect(invoke.calls.allArgs().filter(args => args[0] === 'enviar-ecf').length).toBe(1);
    expect(invoke.calls.allArgs().filter(args => args[0] === 'consultar-operacion-ecf').length).toBe(2);
    service.stopTracking(); tick(8000); expect(invoke.calls.count()).toBe(3);
  }));

  it('proforma firmada no inicia consultas de cola', fakeAsync(() => {
    invoke.and.resolveTo({ data: { ...queued, ecf_operation_id: null, ecf_queue_status: 'FIRMADA', dgii_estado: 'Firmada' } });
    void service.sendInvoice(1); flushMicrotasks(); tick(12000);
    expect(invoke.calls.count()).toBe(1);
  }));

  it('recupera pendientes filtrando empresa/sucursal y sin otro POST', fakeAsync(() => {
    const query: any = { select: jasmine.createSpy('select').and.callFake(() => query), eq: jasmine.createSpy('eq').and.callFake(() => query), in: jasmine.createSpy('in').and.resolveTo({ data: [{ tipo: 'NOTA_CREDITO', documento_id: 8 }] }) };
    from.and.returnValue(query);
    invoke.and.resolveTo({ data: { ...queued, id: 8, ecf_queue_status: 'RECHAZADO', dgii_estado: 'Rechazado' } });
    void service.resumePending(2, 3); flushMicrotasks(); tick(4000); flushMicrotasks();
    expect(query.eq).toHaveBeenCalledWith('empresa_id', 2);
    expect(query.eq).toHaveBeenCalledWith('sucursal_id', 3);
    expect(invoke).toHaveBeenCalledOnceWith('consultar-operacion-ecf', { body: { kind: 'NOTA_CREDITO', documentId: 8 } });
  }));

  it('descarta una consulta que llega después de cerrar sesión', fakeAsync(() => {
    let finish!: (value: unknown) => void;
    invoke.and.callFake((name: string) => name === 'enviar-ecf' ? Promise.resolve({ data: queued }) : new Promise(resolve => finish = resolve));
    const listener = jasmine.createSpy('update'); service.updates$.subscribe(listener);
    void service.sendInvoice(1); flushMicrotasks(); tick(4000); service.stopTracking();
    finish({ data: { ...queued, dgii_estado: 'Aceptado', ecf_queue_status: 'ACEPTADO' } });
    flushMicrotasks(); tick(8000);
    expect(listener.calls.count()).toBe(1);
  }));
});
