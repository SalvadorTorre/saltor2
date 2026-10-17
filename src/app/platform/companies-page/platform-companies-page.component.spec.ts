import { PlatformCompaniesPageComponent } from './platform-companies-page.component';
import { ProformaService } from '../../core/services/proforma/proforma.service';

describe('Proforma por empresa en Plataforma', () => {
  let proformas: jasmine.SpyObj<ProformaService>;
  let app: PlatformCompaniesPageComponent;
  beforeEach(() => {
    proformas = jasmine.createSpyObj('ProformaService', ['getSettings', 'setEnabled', 'setCurrent']);
    app = new PlatformCompaniesPageComponent({} as any, proformas);
    app.selected = { id: 22 } as any;
    app.proforma = { companyId: 22, enabled: false, current: 145, updatedAt: 'v1' };
    spyOn<any>(app, 'toast');
  });
  it('activa la empresa seleccionada y conserva el contador previo', async () => {
    proformas.setEnabled.and.resolveTo({ companyId: 22, enabled: true, current: 145, updatedAt: 'v2' });
    await app.changeProforma(true);
    expect(proformas.setEnabled).toHaveBeenCalledWith(22, true);
    expect(app.proformaEnabled).toBeTrue();
    expect(app.proformaCurrent).toBe(145);
  });
  it('restaura el interruptor si el servidor rechaza la habilitación', async () => {
    proformas.setEnabled.and.rejectWith(new Error('Solo el dueño de la plataforma'));
    await app.changeProforma(true);
    expect(app.proformaEnabled).toBeFalse();
    expect(app.drawerError).toContain('dueño');
    expect(app.isSavingProforma).toBeFalse();
  });
  it('guarda el contador de la empresa seleccionada usando el permiso de plataforma', async () => {
    app.proforma = { ...app.proforma!, enabled: true };
    app.proformaCurrent = 80;
    proformas.setCurrent.and.resolveTo({ ...app.proforma, current: 80 });
    await app.saveProformaCounter();
    expect(proformas.setCurrent).toHaveBeenCalledWith(jasmine.objectContaining({companyId:22}),80,true);
    expect(app.proforma?.current).toBe(80);
  });
});
