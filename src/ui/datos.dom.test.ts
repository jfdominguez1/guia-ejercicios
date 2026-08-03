// @vitest-environment jsdom
// Feature: que una pantalla rota lo diga. El HTML de cada página arranca con un
// "Cargando…" y, si el armado explota, ese texto se queda puesto: en un teléfono
// no hay consola, así que "no carga" era todo lo que se podía saber.
import { beforeEach, describe, expect, it } from 'vitest';
import { arrancarPantalla } from './datos';

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
