// Los GIF también son un dato que puede venir roto de la fuente. Un GIF animado
// SIN la extensión NETSCAPE se reproduce UNA sola vez en el navegador y queda
// congelado en el último frame — que en este dataset es un fundido entre el
// final y el principio del movimiento, así que se ve una superposición confusa.
// Es el bug que JFD reportó el 16/08: "algunos gráficos tienen más de 1 paso y
// aparece cortado". Venían así 21 GIFs (todos de 18 frames, los ejercicios de
// varios pasos); preprocesar.py les inserta la extensión al copiarlos.
import { readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import catalogo from '../data/ejercicios.json';
import type { Ejercicio } from './tipos';

const CATALOGO = catalogo as Ejercicio[];
const DIR_GIF = fileURLToPath(new URL('../../public/media/gif', import.meta.url));

// Los 21 que la fuente trae sin loop. Si preprocesar.py se corre sin el arreglo,
// los archivos vuelven rotos Y el catálogo pierde los mediaV: los dos tests de
// abajo se ponen en rojo.
const SIN_LOOP_EN_LA_FUENTE = [
  '0053', '0087', '0105', '0114', '0295', '0528', '0529', '0535', '0540', '0542',
  '0550', '0555', '0691', '0776', '1306', '1401', '1472', '1473', '1604', '1700', '1732',
];

/** La extensión aparece siempre en la cabecera (offset máximo medido: 784). */
function primerKilobyte(ruta: string): Buffer {
  const buffer = Buffer.alloc(1024);
  const fd = openSync(ruta, 'r');
  try {
    readSync(fd, buffer, 0, 1024, 0);
  } finally {
    closeSync(fd);
  }
  return buffer;
}

describe('media del catálogo — los GIF loopean', () => {
  it('todos los GIF declaran loop infinito (NETSCAPE)', () => {
    const archivos = readdirSync(DIR_GIF).filter((a) => a.endsWith('.gif'));
    expect(archivos.length).toBeGreaterThan(1300);
    const sinLoop = archivos.filter((a) => !primerKilobyte(`${DIR_GIF}/${a}`).includes('NETSCAPE2.0'));
    expect(sinLoop).toEqual([]);
  });

  // El service worker sirve /media/ cache-first para siempre: el archivo
  // arreglado con la misma URL no reemplaza nunca al roto ya cacheado en el
  // teléfono. mediaV versiona la URL y fuerza la re-descarga.
  it('los 21 reparados tienen mediaV para invalidar el cache del teléfono', () => {
    const porId = new Map(CATALOGO.map((e) => [e.id, e]));
    for (const id of SIN_LOOP_EN_LA_FUENTE) {
      expect(porId.get(id)?.mediaV, `mediaV de ${id}`).toBe(2);
    }
  });

  // El estiramiento más grande del mundo (1604) es de la Elongación A de JFD:
  // el ejercicio con más pasos de su rutina era justo uno de los congelados.
  it('el caso reportado (1604, en su rutina) está entre los reparados', () => {
    expect(SIN_LOOP_EN_LA_FUENTE).toContain('1604');
  });
});
