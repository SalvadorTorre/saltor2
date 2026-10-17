import { ProformaService, ProformaSettings } from './proforma.service';

describe('Configuración del contador proforma', () => {
  const settings: ProformaSettings = { companyId: 7, enabled: true, current: 145, updatedAt: '2026-10-16T00:00:00Z' };
  it('ajusta el contador de sesión sin permitir elegir otra empresa en el RPC', async () => {
    const rpc = jasmine.createSpy('rpc').and.resolveTo({ data: { activa: true, ultimo_numero: 90 }, error: null });
    const service = new ProformaService({ client: { rpc } } as any);
    const saved = await service.setCurrent(settings, 90);
    expect(saved.current).toBe(90);
    const args = rpc.calls.mostRecent().args[1];
    expect(args.p_numero_esperado).toBe(145);
    expect(args.p_actualizado_en).toBe(settings.updatedAt);
    expect(args.p_empresa_id).toBeUndefined();
  });
  it('rechaza contadores negativos, decimales y fuera del rango antes de escribir', async () => {
    const rpc = jasmine.createSpy('rpc');
    const service = new ProformaService({ client: { rpc } } as any);
    for (const current of [-1, 0.5, 100000000000]) await expectAsync(service.setCurrent(settings, current)).toBeRejected();
    expect(rpc).not.toHaveBeenCalled();
  });
});
