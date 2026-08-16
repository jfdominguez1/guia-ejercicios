// @vitest-environment jsdom
// Feature: que una pantalla rota lo diga. El HTML de cada página arranca con un
// "Cargando…" y, si el armado explota, ese texto se queda puesto: en un teléfono
// no hay consola, así que "no carga" era todo lo que se podía saber.
import { beforeEach, describe, expect, it } from 'vitest';
import { arrancarPantalla, equivalenteConDemo, htmlEquivalenteConDemo, tieneDemo, urlGif, urlImg } from './datos';
import type { Ejercicio } from '../lib/tipos';

beforeEach(() => {
  document.body.innerHTML = '<div id="caja"><p class="ayuda">Cargando…</p></div>';
});

describe('arrancarPantalla', () => {
  it('deja trabajar a la pantalla cuando todo anda', async () => {
    await arrancarPantalla('#caja', () => {
      document.querySelector('#caja')!.innerHTML = '<h1>Press de banca</h1>';
    });

    expect(document.querySelector('#caja')!.innerHTML).toContain('Press de banca');
  });

  it('reemplaza el "Cargando…" por el error cuando el armado explota', async () => {
    await arrancarPantalla('#caja', () => {
      throw new Error('No pude cargar el catálogo (404)');
    });

    const caja = document.querySelector('#caja')!;
    expect(caja.textContent).not.toContain('Cargando');
    expect(caja.textContent).toContain('No pude abrir esta pantalla');
    expect(caja.textContent).toContain('404');
    expect(caja.querySelector('#btn-reintentar')).not.toBeNull();
  });

  it('también atrapa lo que falla después de un await', async () => {
    await arrancarPantalla('#caja', async () => {
      await Promise.resolve();
      throw new Error('sin red');
    });

    expect(document.querySelector('#caja')!.textContent).toContain('sin red');
  });
});

// JFD (12/08): "el de estiramiento de talones del pie no tiene los gif". No es
// que falte el archivo: se lo sacamos porque mostraba OTRO ejercicio (alguien
// haciendo remo con mancuerna). En vez de dejar el hueco, se ofrece uno del
// mismo movimiento que sí se puede mirar.
describe('ejercicio sin demostración', () => {
  const base = (id: string, nombre: string, extra: Partial<Ejercicio> = {}): Ejercicio => ({
    id, nombre_es: nombre, nombre_en: nombre, tipo: 'elongacion', grupo: 'cuerpo', equipment: 'body weight',
    zona: 'Piernas', musculo: 'Pantorrillas', secundarios: [], pasos: [], movimiento: 'elongacion-pantorrillas',
    basico: true, ...extra,
  });
  const sinDemo = base('1398', 'Estiramiento de talones de pie', { demoDudosa: true });
  const conDemo = base('1377', 'Estiramiento de talones con manos contra la pared');
  const otroMovimiento = base('9999', 'Estiramiento de cuello', { movimiento: 'elongacion-cuello' });

  it('el dibujo dudoso se sigue mostrando, pero avisado', () => {
    const html = htmlEquivalenteConDemo(sinDemo, [sinDemo, conDemo]);
    expect(tieneDemo(sinDemo)).toBe(true); // el GIF se muestra igual
    expect(html).toContain('puede no ser este ejercicio');
  });

  it('propone el equivalente que sí tiene dibujo', () => {
    expect(equivalenteConDemo(sinDemo, [sinDemo, conDemo])?.id).toBe('1377');
    expect(htmlEquivalenteConDemo(sinDemo, [sinDemo, conDemo]))
      .toContain('Estiramiento de talones con manos contra la pared');
  });

  it('no propone nada de otro movimiento', () => {
    expect(equivalenteConDemo(sinDemo, [sinDemo, otroMovimiento])).toBeNull();
    expect(htmlEquivalenteConDemo(sinDemo, [sinDemo, otroMovimiento])).toBe('');
  });

  it('el que sí tiene dibujo no necesita que le propongan otro', () => {
    expect(equivalenteConDemo(conDemo, [sinDemo, conDemo])).toBeNull();
  });
});

// La media se sirve cache-first (inmutable) desde el service worker: un archivo
// corregido con la misma URL nunca reemplaza al que el teléfono ya cacheó.
// mediaV cambia la URL (query) y fuerza la re-descarga — así llegan los 21 GIFs
// con el loop reparado a un teléfono que los tenía congelados.
describe('URLs de media versionadas', () => {
  it('sin mediaV la URL queda limpia, como siempre', () => {
    expect(urlGif({ id: '0001' })).toMatch(/\/media\/gif\/0001\.gif$/);
    expect(urlImg({ id: '0001' })).toMatch(/\/media\/img\/0001\.jpg$/);
  });

  it('con mediaV la URL lleva la versión y el cache viejo no la matchea', () => {
    expect(urlGif({ id: '1604', mediaV: 2 })).toMatch(/\/media\/gif\/1604\.gif\?v=2$/);
    expect(urlImg({ id: '1604', mediaV: 2 })).toMatch(/\/media\/img\/1604\.jpg\?v=2$/);
  });
});
