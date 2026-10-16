import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth/auth.service';
import { PlatformPlan, PlatformService } from '../../core/services/platform/platform.service';
import { SupabaseService } from '../../core/services/supabase/supabase.service';
import {
  INSTALLER_IMAGES, InstallerSources, LicenseType, LocalInstallerOptions, buildInstallerPackage, randomSecret, validateOptions
} from './local-installer.builder';

interface BuildManifest { version: string; generado: string; archivos: { ruta: string; bytes: number }[] }
interface FunctionsBundle { archivos: { ruta: string; contenido: string }[] }

@Component({
  selector: 'app-local-installer-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './local-installer-page.component.html',
  styleUrls: ['./local-installer-page.component.scss']
})
export class LocalInstallerPageComponent implements OnInit {
  readonly images = INSTALLER_IMAGES;
  plans: PlatformPlan[] = [];
  form: LocalInstallerOptions = this.defaults();
  showPasswords = false;
  showAdvanced = false;

  isBuilding = false;
  progress = '';
  progressPct = 0;
  errorMessage = '';
  result: { nombre: string; archivos: number; bytes: number; usuario: string; puerto: number } | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformService,
    private readonly supabase: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.auth.restoreSession();
    const user = this.auth.currentUser;
    if (user) {
      this.form.rootCorreo = user.email;
      this.form.rootUsuario = user.username;
      this.form.rootNombre = (user.fullName || '').split(' ')[0] || 'Soporte';
    }
    try {
      this.plans = (await this.platform.getPlans()).filter((p) => p.activo);
      if (this.plans.length && !this.plans.some((p) => p.nombre === this.form.plan)) this.form.plan = this.plans[0].nombre;
    } catch { /* el plan es opcional */ }
  }

  private defaults(): LocalInstallerOptions {
    return {
      cliente: '', rnc: '', correoEmpresa: '', telefono: '',
      rootCorreo: '', rootUsuario: '', rootNombre: 'Soporte',
      rootPassword: randomSecret(14), postgresPassword: randomSecret(28),
      licencia: 'Activa', licenciaHasta: this.isoPlusDays(365), plan: '',
      puertoWeb: 8080, exponerPostgres: false, puertoPostgres: 5432,
      qzCertificado: '', qzLlave: ''
    };
  }

  setLicense(type: LicenseType): void {
    this.form.licencia = type;
    this.form.licenciaHasta = this.isoPlusDays(type === 'Prueba' ? 15 : 365);
  }

  regenerate(field: 'rootPassword' | 'postgresPassword'): void {
    this.form[field] = randomSecret(field === 'rootPassword' ? 14 : 28);
    this.showPasswords = true;
  }

  async generate(): Promise<void> {
    this.errorMessage = '';
    this.result = null;
    this.form.puertoWeb = Number(this.form.puertoWeb);
    this.form.puertoPostgres = Number(this.form.puertoPostgres);
    const invalid = validateOptions(this.form);
    if (invalid) { this.errorMessage = invalid; return; }

    this.isBuilding = true;
    try {
      const sources = await this.loadSources();
      this.step('Armando el paquete…', 95);
      const pkg = await buildInstallerPackage(this.form, sources);
      this.download(pkg.zip, pkg.nombreArchivo);
      this.result = {
        nombre: pkg.nombreArchivo, archivos: pkg.resumen.archivos, bytes: pkg.resumen.bytes,
        usuario: this.form.rootUsuario.trim(), puerto: this.form.puertoWeb
      };
      this.step('Listo', 100);
    } catch (error) {
      this.errorMessage = this.message(error);
    } finally {
      this.isBuilding = false;
    }
  }

  /** Esquema de la base (desde la nube), sistema web compilado y funciones Edge. */
  private async loadSources(): Promise<InstallerSources> {
    this.step('Obteniendo el esquema de la base de datos…', 5);
    const { data: esquemaSql, error } = await this.supabase.client.rpc('plataforma_esquema_instalador');
    if (error) {
      throw new Error(/plataforma_esquema_instalador/.test(error.message ?? '')
        ? 'Falta aplicar la migración 20261014200000_instalador_local.sql en la base de datos.'
        : error.message);
    }

    this.step('Leyendo el sistema web…', 12);
    const manifest = await this.fetchJson<BuildManifest>('instalador/manifiesto.json');
    const bundle = await this.fetchJson<FunctionsBundle>('instalador/funciones.json');

    const web: InstallerSources['web'] = [];
    const total = manifest.archivos.length;
    let done = 0;
    const queue = [...manifest.archivos];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const response = await fetch(this.url(item.ruta), { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudo descargar ${item.ruta} (${response.status}).`);
        web.push({ ruta: item.ruta, datos: new Uint8Array(await response.arrayBuffer()) });
        done++;
        this.step(`Descargando el sistema web (${done} de ${total})…`, 12 + Math.round((done / total) * 80));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    return { esquemaSql: String(esquemaSql), web, funciones: bundle.archivos, version: manifest.version };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path), { cache: 'no-store' });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('json')) {
      throw new Error('No se encontró el paquete del sistema web en el servidor. Compila con "npm run build" '
        + '(en lugar de "ng build") y vuelve a subir la carpeta dist/saltor2.');
    }
    return response.json() as Promise<T>;
  }

  private url(path: string): string { return new URL(path, document.baseURI).href; }

  private step(text: string, pct: number): void { this.progress = text; this.progressPct = pct; }

  private download(blob: Blob, name: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }

  size(bytes: number): string { return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }

  private isoPlusDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private message(error: unknown): string {
    return String((error as { message?: string })?.message ?? error ?? 'No se pudo generar el paquete.');
  }
}
