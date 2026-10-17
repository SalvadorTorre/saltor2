import { TestBed } from '@angular/core/testing';
import { NcfPageComponent } from './ncf-page.component';
import { NcfService } from '../../core/services/ncf/ncf.service';
import { ProformaService } from '../../core/services/proforma/proforma.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { NcfSequence } from '../../app.models';

const sequence = (id: number, start = '501', used = 24): NcfSequence => ({
  id, companyId: 7, ncfType: '31 - Factura de Credito Fiscal Electronica', series: 'E31',
  authorization: 'AUT-1', requested: 1000, accepted: 500, rangeStart: start, rangeEnd: '1000',
  authorizedAt: '2026-10-16', expiresAt: '2099-12-31', used, total: 500,
  status: 'Activa', alert: false, alertPercent: 80
});

describe('Registro de solicitudes e-NCF', () => {
  let ncf: jasmine.SpyObj<NcfService>;
  let proformas: jasmine.SpyObj<ProformaService>;
  let auth: { currentUser: { companyId: number } | null; restoreSession: jasmine.Spy };
  beforeEach(() => {
    proformas = jasmine.createSpyObj('ProformaService', ['getSettings', 'setCurrent', 'getHistory']);
    proformas.getSettings.and.resolveTo({ companyId: 7, enabled: false, current: 0, updatedAt: null });
    ncf = jasmine.createSpyObj('NcfService', ['getSequences', 'createSequence', 'updateSequence', 'getSequenceHistory']);
    auth = { currentUser: { companyId: 7 }, restoreSession: jasmine.createSpy('restoreSession').and.resolveTo({ companyId: 7 }) };
    ncf.getSequences.and.resolveTo([sequence(1), { ...sequence(2), status: 'Agotada', used: 500 }]);
    TestBed.configureTestingModule({ imports: [NcfPageComponent], providers: [
      { provide: NcfService, useValue: ncf }, { provide: AuthService, useValue: auth }, { provide: ProformaService, useValue: proformas }
    ] });
  });

  it('muestra todos los rangos de la sesión sin modal ni selector de empresa', async () => {
    const fixture = TestBed.createComponent(NcfPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ncf.getSequences).toHaveBeenCalledWith(7);
    expect(fixture.nativeElement.querySelector('th').textContent).toBe('Tipo de comprobante');
    expect(fixture.nativeElement.querySelector('[aria-label="Filtrar por empresa"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sequence-editor')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(11);
    expect(fixture.nativeElement.textContent).toContain('E310000000524');
  });

  it('registra otra solicitud sin reemplazar los registros anteriores', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    await app.load();
    app.newRequest();
    app.form = { ...app.form, authorization: 'AUT-2', requested: 1000, accepted: 500,
      rangeStart: 'E310000001001', rangeEnd: 'E310000001500', authorizedAt: '2026-10-16', expiresAt: '2027-12-31' };
    ncf.createSequence.and.resolveTo({ ...sequence(3), rangeStart: '1001', rangeEnd: '1500' });
    await app.save();
    expect(app.sequences.length).toBe(3);
    expect(app.sequences.some(s => s.id === 1)).toBeTrue();
    expect(ncf.createSequence.calls.mostRecent().args[0].rangeStart).toBe('1001');
    expect(ncf.updateSequence).not.toHaveBeenCalled();
    expect(app.editorVisible).toBeFalse();
  });

  it('rechaza cantidades que no coinciden con el rango antes de escribir', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    app.newRequest();
    app.form = { ...app.form, companyId: 7, authorization: 'AUT-2', requested: 1000, accepted: 499,
      rangeStart: '501', rangeEnd: '1000', authorizedAt: '2026-10-16', expiresAt: '2027-12-31' };
    await app.save();
    expect(ncf.createSequence).not.toHaveBeenCalled();
    expect(app.message).toContain('coincidir');
  });

  it('calcula el número actual con inicio distinto de uno y prefijo completo', () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    expect(app.currentNumber(sequence(1, 'E310000000501'))).toBe('E310000000524');
    expect(app.nextNumber(sequence(1))).toBe('E310000000525');
    expect(app.currentNumber(sequence(1, '501', 0))).toBe('Sin utilizar');
    expect(app.nextNumber({ ...sequence(1), used: 500 })).toBe('No disponible');
  });

  it('presenta error recuperable y no muestra datos de demostración si falla la carga', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    ncf.getSequences.and.rejectWith(new Error('Sin conexión'));
    await app.load();
    expect(app.isLoading).toBeFalse();
    expect(app.loadError).toContain('Sin conexión');
    expect(app.sequences).toEqual([]);
  });

  it('mantiene el formulario ante un conflicto con el contador actualizado', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    app.edit(sequence(1));
    ncf.updateSequence.and.rejectWith(new Error('La secuencia cambió mientras la editabas.'));
    await app.save();
    expect(app.editorVisible).toBeTrue();
    expect(app.messageIsError).toBeTrue();
    expect(app.message).toContain('cambió');
    expect(app.isSaving).toBeFalse();
  });

  it('muestra cada tipo sin configurar con rango 0 a 99999999999 sin crear autorizaciones', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    ncf.getSequences.and.resolveTo([]);
    await app.load();
    expect(app.gridSequences.length).toBe(app.data.ncfTypes.length);
    for (const row of app.gridSequences) {
      expect(row.rangeStart).toBe('0');
      expect(row.rangeEnd).toBe('99999999999');
      expect(app.currentNumber(row)).toBe('0');
      expect(app.status(row)).toBe('Pendiente de configurar');
      expect(app.nextNumber(row)).toBe('No disponible');
    }
    expect(ncf.createSequence).not.toHaveBeenCalled();
  });

  it('configurar una fila predeterminada abre el tipo correcto y exige los datos autorizados', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    ncf.getSequences.and.resolveTo([]);
    await app.load();
    const row = app.gridSequences.find(s => s.series === 'E34')!;
    app.edit(row);
    expect(app.editing).toBeNull();
    expect(app.form.companyId).toBe(7);
    expect(app.form.series).toBe('E34');
    expect(app.form.rangeStart).toBe('0');
    expect(app.form.rangeEnd).toBe('99999999999');
    await app.save();
    expect(ncf.createSequence).not.toHaveBeenCalled();
    expect(app.messageIsError).toBeTrue();
  });

  it('conserva los rangos reales sin duplicar su tipo con una fila predeterminada', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    await app.load();
    app.sequences[0].ncfType = '01 - Credito Fiscal';
    expect(app.gridSequences.some(s => s.series === 'E01')).toBeFalse();
    expect(app.gridSequences.filter(s => s.series === 'E31').length).toBe(2);
    expect(app.gridSequences.filter(s => s.series === 'E31').every(s => !s.isDefault)).toBeTrue();
    expect(app.gridSequences.some(s => s.series === 'E32' && s.isDefault)).toBeTrue();
    app.typeFilter = app.data.ncfTypes[1];
    expect(app.filteredSequences.length).toBe(1);
  });


  it('descarta filas de otra empresa y nunca genera predeterminadas para otros tenants', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    ncf.getSequences.and.resolveTo([sequence(1), { ...sequence(99), companyId: 99, series: 'E999', ncfType: '999 - Ajena' }]);
    await app.load();
    expect(app.gridSequences.every(s => s.companyId === 7)).toBeTrue();
    expect(app.types.some(t => t.includes('Ajena'))).toBeFalse();
    app.edit({ ...sequence(99), companyId: 99 });
    expect(app.editorVisible).toBeFalse();
  });

  it('impone la empresa de sesión al guardar aunque el formulario tenga otra', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    app.newRequest();
    app.form = { ...app.form, companyId: 99, authorization: 'AUT-2', requested: 500, accepted: 500,
      rangeStart: '1001', rangeEnd: '1500', authorizedAt: '2026-10-16', expiresAt: '2027-12-31' };
    ncf.createSequence.and.resolveTo(sequence(3));
    await app.save();
    expect(ncf.createSequence.calls.mostRecent().args[0].companyId).toBe(7);
  });

  it('sin una empresa en sesión no consulta ni muestra filas predeterminadas', async () => {
    auth.currentUser = null;
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    await app.load();
    expect(ncf.getSequences).not.toHaveBeenCalled();
    expect(app.gridSequences).toEqual([]);
    expect(app.loadError).toContain('sesión');
  });


  it('E332 solo aparece activa para la empresa de sesión y ocupa la primera fila', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    proformas.getSettings.and.resolveTo({ companyId: 7, enabled: true, current: 145, updatedAt: '2026-10-16T00:00:00Z' });
    await app.load();
    expect(app.gridSequences[0].series).toBe('E332');
    expect(app.gridSequences[0].isProforma).toBeTrue();
    expect(app.currentNumber(app.gridSequences[0])).toBe('145');
    app.proforma = { ...app.proforma!, enabled: false };
    expect(app.gridSequences.some(s => s.series === 'E332')).toBeFalse();
    expect(app.types.some(t => t.startsWith('332'))).toBeFalse();
  });

  it('oculta la antigua secuencia E332 fiscal cuando proforma está desactivada', async () => {
    const app = TestBed.createComponent(NcfPageComponent).componentInstance;
    ncf.getSequences.and.resolveTo([{ ...sequence(99), ncfType: '332', series: 'E332' }]);
    await app.load();
    expect(app.gridSequences.some(s => s.series === 'E332')).toBeFalse();
  });

  it('ajusta el contador interno sin pedir autorización ni escribir una secuencia fiscal', async () => {
    const fixture = TestBed.createComponent(NcfPageComponent);
    const app = fixture.componentInstance;
    proformas.getSettings.and.resolveTo({ companyId: 7, enabled: true, current: 145, updatedAt: '2026-10-16T00:00:00Z' });
    proformas.setCurrent.and.resolveTo({ companyId: 7, enabled: true, current: 90, updatedAt: '2026-10-16T01:00:00Z' });
    fixture.detectChanges(); await fixture.whenStable();
    app.edit(app.gridSequences[0]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[name="authorization"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[name="expiresAt"]')).toBeNull();
    app.proformaCurrent = 90;
    await app.saveProforma();
    expect(proformas.setCurrent).toHaveBeenCalled();
    expect(ncf.createSequence).not.toHaveBeenCalled();
    expect(ncf.updateSequence).not.toHaveBeenCalled();
    expect(app.currentNumber(app.gridSequences[0])).toBe('90');
  });

});
