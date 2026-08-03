// Sella la VERSION del service worker en dist/ con la huella del build.
//
// Por qué existe: el navegador solo instala un service worker nuevo si el ARCHIVO
// cambió de bytes. Con `VERSION` escrita a mano, sw.js fue idéntico desde el
// 13/07: nunca se volvió a correr el `install`, el precache quedó congelado y la
// ficha de ejercicio siguió sirviendo el HTML de julio, que pide un bundle que
// GitHub Pages ya no publica → "Cargando…" eterno (03/08).
//
// La huella sale de los nombres + tamaños de todo lo que hay en dist/: cambia
// exactamente cuando cambió algo publicado (Astro hashea los assets, y el
// catálogo cambia de tamaño), y dos builds iguales dan la misma versión, así que
// no molesta con actualizaciones inventadas.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RE_VERSION = /const VERSION = '[^']*';/;

/** Reemplaza la línea de VERSION. Explota si no la encuentra: sellar de mentira
 *  (dejar el archivo igual) es justo el bug que este script viene a evitar. */
export function sellar(codigo, version) {
  if (!RE_VERSION.test(codigo)) {
    throw new Error("No encontré la línea `const VERSION = '…';` en sw.js: el sellado no haría nada.");
  }
  return codigo.replace(RE_VERSION, `const VERSION = '${version}';`);
}

/** Huella estable de una lista de [ruta, tamaño]. */
export function huella(archivos) {
  const texto = [...archivos]
    .map(([ruta, tamano]) => `${ruta}:${tamano}`)
    .sort()
    .join('\n');
  return createHash('sha1').update(texto).digest('hex').slice(0, 10);
}

function listar(dir, raiz = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const completo = join(dir, entrada.name);
    if (entrada.isDirectory()) return listar(completo, raiz);
    const ruta = relative(raiz, completo);
    // El propio sw.js queda afuera: su tamaño depende de la versión que le vamos
    // a escribir, y eso se muerde la cola.
    return ruta === 'sw.js' ? [] : [[ruta, statSync(completo).size]];
  });
}

export function sellarDist(dist) {
  const archivo = join(dist, 'sw.js');
  const version = `ge-${huella(listar(dist))}`;
  writeFileSync(archivo, sellar(readFileSync(archivo, 'utf8'), version));
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  console.log(`sw.js sellado: ${sellarDist(dist)}`);
}
