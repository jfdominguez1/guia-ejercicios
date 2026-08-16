// @vitest-environment jsdom
// Feature: "Reportar un problema" desde cualquier pantalla, SIN cortar lo que
// estabas haciendo. Es un overlay a propósito: no navega, así que el wizard
// queda montado con sus series cargadas y al cerrar seguís exactamente ahí.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { montarReporte } from './reporte';
import { storage } from '../lib/storage';

function mockLocalStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage());
  // Sin red en los tests: la versión simplemente no viaja (best-effort real).
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')));
  document.body.innerHTML = `
    <main>
      <div id="wizard"><h1>Press de banca</h1><input id="serie-1" value="12" /></div>
      <button type="button" id="btn-reportar">⚑ Reportar un problema</button>
    </main>`;
  montarReporte();
});

const abrir = () => {
  (document.querySelector('#btn-reportar') as HTMLButtonElement).click();
  return document.querySelector('#overlay-reporte')!;
};

async function guardar(texto: string) {
  const overlay = abrir();
  (overlay.querySelector('#texto-reporte') as HTMLTextAreaElement).value = texto;
  (overlay.querySelector('#btn-guardar-reporte') as HTMLButtonElement).click();
  // el guardado espera el fetch de la versión (que acá falla y sigue igual)
  await vi.waitFor(() => expect(overlay.querySelector('#btn-cerrar-reporte')).not.toBeNull());
  return overlay;
}

describe('reportar un problema', () => {
  it('guarda el reporte con pantalla y fecha, y confirma', async () => {
    await guardar('toco Guardar y no pasa nada');

    const reportes = storage.getReportes();
    expect(reportes).toHaveLength(1);
    expect(reportes[0]!.texto).toBe('toco Guardar y no pasa nada');
    expect(reportes[0]!.pantalla).toBe(location.pathname);
    expect(reportes[0]!.fecha).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(document.querySelector('#overlay-reporte')!.textContent).toContain('Reporte guardado');
  });

  // El requisito central: reportar NO corta el ejercicio. La pantalla de atrás
  // no se toca ni se re-renderiza — al cerrar estás donde estabas, con lo cargado.
  it('no navega ni toca la sesión en curso, y al cerrar volvés donde estabas', async () => {
    const wizardAntes = document.querySelector('#wizard')!;
    (document.querySelector('#serie-1') as HTMLInputElement).value = '15';

    const overlay = await guardar('el dibujo se ve congelado');
    (overlay.querySelector('#btn-cerrar-reporte') as HTMLButtonElement).click();

    expect(document.querySelector('#overlay-reporte')).toBeNull();
    // El MISMO nodo, no uno re-renderizado: nada se desmontó ni se pisó.
    expect(document.querySelector('#wizard')).toBe(wizardAntes);
    expect((document.querySelector('#serie-1') as HTMLInputElement).value).toBe('15');
  });

  it('captura la sesión en curso desde el draft del wizard', async () => {
    localStorage.setItem(
      'ge:draft',
      JSON.stringify({ nombreDia: 'Fuerza A', indice: 1, ejercicios: [{ ejercicioId: '0577' }, { ejercicioId: '0739' }] }),
    );
    await guardar('algo anda mal acá');

    expect(storage.getReportes()[0]!.sesionActiva).toBe('Fuerza A · ejercicio 2/2 (0739)');
  });

  it('sin texto no guarda nada', async () => {
    const overlay = abrir();
    (overlay.querySelector('#texto-reporte') as HTMLTextAreaElement).value = '   ';
    (overlay.querySelector('#btn-guardar-reporte') as HTMLButtonElement).click();
    await Promise.resolve();
    await vi.waitFor(() =>
      expect((overlay.querySelector('#btn-guardar-reporte') as HTMLButtonElement).disabled).toBe(false),
    );

    expect(storage.getReportes()).toEqual([]);
    // sigue abierto esperando el texto, no confirma de mentira
    expect(overlay.querySelector('#texto-reporte')).not.toBeNull();
  });

  it('cancelar cierra sin guardar', () => {
    const overlay = abrir();
    (overlay.querySelector('#texto-reporte') as HTMLTextAreaElement).value = 'algo escrito';
    (overlay.querySelector('#btn-cancelar-reporte') as HTMLButtonElement).click();

    expect(document.querySelector('#overlay-reporte')).toBeNull();
    expect(storage.getReportes()).toEqual([]);
  });
});
