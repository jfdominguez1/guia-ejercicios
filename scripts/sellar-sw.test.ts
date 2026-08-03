import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { huella, sellar } from './sellar-sw.mjs';

describe('sellado del service worker', () => {
  it('escribe la versión del build en el archivo', () => {
    expect(sellar("const VERSION = 'ge-dev';\n// resto", 'ge-abc123')).toBe(
      "const VERSION = 'ge-abc123';\n// resto",
    );
  });

  it('explota si no encuentra la línea, en vez de sellar de mentira', () => {
    // Renombrar la constante dejaría el sw.js idéntico en cada deploy y el
    // navegador no volvería a instalarlo nunca: ese ERA el bug.
    expect(() => sellar('const CACHE = "ge-v1";', 'ge-abc123')).toThrow(/VERSION/);
  });

  it('el sw.js de verdad es sellable', () => {
    const codigo = readFileSync('public/sw.js', 'utf8');
    expect(sellar(codigo, 'ge-prueba')).toContain("const VERSION = 'ge-prueba';");
  });

  it('la huella cambia cuando cambia algo publicado', () => {
    const antes = huella([['_astro/hoy.abc.js', 100], ['data/ejercicios.json', 1164073]]);
    const otroBundle = huella([['_astro/hoy.xyz.js', 100], ['data/ejercicios.json', 1164073]]);
    const otroCatalogo = huella([['_astro/hoy.abc.js', 100], ['data/ejercicios.json', 1164999]]);
    expect(otroBundle).not.toBe(antes);
    expect(otroCatalogo).not.toBe(antes);
  });

  it('la huella no cambia si es el mismo build (no inventa actualizaciones)', () => {
    const a = huella([['b.js', 2], ['a.js', 1]]);
    const b = huella([['a.js', 1], ['b.js', 2]]);
    expect(a).toBe(b);
  });
});
