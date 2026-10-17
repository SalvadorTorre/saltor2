import { NcfService } from './ncf.service';
import { NcfSequenceFormModel } from '../../../app.models';

describe('Persistencia del registro e-NCF', () => {
  it('pagina todos los registros sin truncar al límite de una respuesta', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ id: 1000 - index, empresa_id: 1, total: 10 }));
    const second = [{ id: 500, empresa_id: 1, total: 10 }];
    let page = 0;
    const query: any = {
      select: () => query, order: () => query, limit: () => query,
      eq: jasmine.createSpy('eq').and.callFake(() => query),
      lt: jasmine.createSpy('lt').and.callFake(() => query),
      then: (resolve: any) => Promise.resolve({ data: page++ === 0 ? first : second, error: null }).then(resolve)
    };
    const service = new NcfService({ client: { from: () => query } } as any);
    const rows = await service.getSequences(1);
    expect(rows.length).toBe(501);
    expect(rows[500].id).toBe(500);
    expect(query.lt).toHaveBeenCalledWith('id', 501);
    expect(query.eq).toHaveBeenCalledWith('empresa_id', 1);
  });

  it('rechaza una edición si cambió la versión o el contador mientras estaba abierta', async () => {
    const query: any = {
      update: () => query, select: () => query,
      eq: jasmine.createSpy('eq').and.callFake(() => query),
      maybeSingle: () => Promise.resolve({ data: null, error: null })
    };
    const service = new NcfService({ client: { from: () => query } } as any);
    const form: NcfSequenceFormModel = { companyId: 1, ncfType: '31', series: 'E31', rangeStart: '1', rangeEnd: '500',
      authorizedAt: '2026-10-16', expiresAt: '2027-12-31', used: 24, status: 'Activa', alertPercent: 80 };
    await expectAsync(service.updateSequence(1, form, 500, false, '2026-10-16T00:00:00Z'))
      .toBeRejectedWithError(/cambió/);
    expect(query.eq).toHaveBeenCalledWith('usados', 24);
    expect(query.eq).toHaveBeenCalledWith('actualizado_en', '2026-10-16T00:00:00Z');
  });
});
