// Después de "ng build": deja en dist/saltor2/instalador/ lo que necesita
// Plataforma › Instalador local para armar el paquete de un cliente:
//   manifiesto.json  lista de archivos del sistema web compilado
//   funciones.json   código de las funciones Edge (supabase/functions)
// Se ejecuta solo con "npm run build".
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist', 'saltor2');
const out = path.join(dist, 'instalador');

async function walk(dir, base = dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full, base));
    else result.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return result;
}

const envSource = await readFile(path.join(root, 'src', 'environments', 'environment.ts'), 'utf8').catch(() => '');
const version = /appVersion:\s*'([^']+)'/.exec(envSource)?.[1] ?? 'sin-version';

try { await stat(path.join(dist, 'index.html')); }
catch { console.error('No existe dist/saltor2/index.html. Ejecuta primero ng build.'); process.exit(1); }

const omitir = (ruta) => ruta === '.htaccess' || ruta === 'config.js' || ruta.startsWith('instalador/');
const archivos = [];
for (const ruta of (await walk(dist)).filter((r) => !omitir(r)).sort()) {
  archivos.push({ ruta, bytes: (await stat(path.join(dist, ruta))).size });
}

const funciones = [];
const functionsDir = path.join(root, 'supabase', 'functions');
for (const ruta of (await walk(functionsDir)).sort()) {
  if (ruta.split('/').some((part) => part.startsWith('.'))) continue;
  if (!/\.(ts|js|json|jsonc|html)$/.test(ruta)) continue;
  funciones.push({ ruta, contenido: await readFile(path.join(functionsDir, ruta), 'utf8') });
}
funciones.push({ ruta: 'main/index.ts', contenido: await readFile(path.join(root, 'supabase', 'instalador', 'main', 'index.ts'), 'utf8') });

await mkdir(out, { recursive: true });
const generado = new Date().toISOString();
await writeFile(path.join(out, 'manifiesto.json'), JSON.stringify({ version, generado, archivos }));
await writeFile(path.join(out, 'funciones.json'), JSON.stringify({ version, generado, archivos: funciones }));

const total = archivos.reduce((sum, a) => sum + a.bytes, 0);
console.log(`Instalador local: ${archivos.length} archivos web (${(total / 1048576).toFixed(1)} MB) y ${funciones.length} archivos de funciones, versión ${version}.`);
