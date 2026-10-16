import { TestBed } from '@angular/core/testing';
import { Router, Route, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent, MenuLink } from './app.component';
import { adminOnly, routes } from './app-routing.module';
import { ActiveUserSession, AuthService } from './core/services/auth/auth.service';

function fullPaths(list: Route[], prefix = ''): string[] {
  return list.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join('/');
    const own = route.loadComponent ? [`/${path}`] : [];
    return [...own, ...fullPaths(route.children ?? [], path)];
  });
}

function user(role: string): ActiveUserSession {
  return {
    id: 1, authUserId: 'u', username: 'U', fullName: 'Usuario Prueba', email: 'u@x.com',
    companyId: 1, companyName: 'Empresa', branch: 'Principal', branchId: 1, role
  };
}

describe('AppComponent', () => {
  beforeEach(() => {
    const auth = jasmine.createSpyObj<AuthService>('AuthService', { restoreSession: Promise.resolve(null), signOut: Promise.resolve() });

    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      declarations: [AppComponent],
      providers: [{ provide: AuthService, useValue: auth }]
    });
  });

  it('every menu link points to an existing route', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const known = new Set(fullPaths(routes));
    const links: MenuLink[] = app.sections.flatMap((section) => [
      ...(section.path ? [{ label: section.label, path: section.path }] : []),
      ...(section.groups ?? []).flatMap((group) => group.links)
    ]);

    const broken = links.filter((link) => !known.has(link.path)).map((link) => link.path);
    expect(broken).toEqual([]);
  });

  it('highlights the section that matches the URL and shows its submenu', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;

    app.syncMenuWithUrl('/contabilidad/rep-607');
    expect(app.activeTopSection).toBe('contabilidad');
    expect(app.activeSection?.label).toBe('Contabilidad');
    expect(app.hasSidebar).toBeTrue();

    app.syncMenuWithUrl('/configuracion/rnc');
    expect(app.activeTopSection).toBe('settings');

    app.syncMenuWithUrl('/mantenimiento/entrada-productos');
    expect(app.activeTopSection).toBe('maintenance');
  });

  it('gives the full width to sections without a submenu', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;

    app.syncMenuWithUrl('/facturacion');
    expect(app.hasSidebar).toBeFalse();

    app.syncMenuWithUrl('/inicio');
    expect(app.activeTopSection).toBe('dashboard');
    expect(app.hasSidebar).toBeFalse();
  });

  it('closes the mobile menu after navigating', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;

    app.toggleSidebar();
    expect(app.isSidebarOpen).toBeTrue();

    app.syncMenuWithUrl('/caja/cierre');
    expect(app.isSidebarOpen).toBeFalse();
  });

  it('hides admin-only settings from other roles', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const settings = app.sections.find((section) => section.key === 'settings')!.groups![0].links;

    app.activeUser = user('Cajero');
    expect(app.visibleLinks(settings).map((link) => link.label)).not.toContain('Usuarios');

    app.activeUser = user('Administrador');
    expect(app.visibleLinks(settings).map((link) => link.label)).toContain('Usuarios');
  });
});

describe('adminOnly guard', () => {
  let auth: { currentUser: ActiveUserSession | null; readonly isAdmin: boolean; restoreSession: jasmine.Spy };

  beforeEach(() => {
    auth = {
      currentUser: null,
      get isAdmin() { return this.currentUser?.role === 'Administrador'; },
      restoreSession: jasmine.createSpy('restoreSession')
    };
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: auth }]
    });
  });

  const run = () => TestBed.runInInjectionContext(() => adminOnly({} as Route, []));

  it('waits for the restored session before deciding (page reload)', async () => {
    auth.restoreSession.and.callFake(async () => {
      auth.currentUser = user('Administrador');
      return auth.currentUser;
    });

    expect(await run()).toBeTrue();
    expect(auth.restoreSession).toHaveBeenCalled();
  });

  it('sends other roles back to Inicio', async () => {
    auth.restoreSession.and.callFake(async () => {
      auth.currentUser = user('Cajero');
      return auth.currentUser;
    });

    const result = await run();
    expect(result instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/inicio');
  });
});
