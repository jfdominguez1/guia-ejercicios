// @vitest-environment jsdom
// Feature: los flujos reales de la pantalla Historial, ejercitando el DOM.
// Estos tests existen porque los 183 tests de lógica pura no atrapan errores de
// wiring (un data-attribute mal escrito, un listener que no se conecta), que es
// justo la clase de bug que aparece recién en el teléfono.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarHistorial } from './historial';
import { storage } from '../lib/storage';
import type { Ejercicio, Sesion } from '../lib/tipos';

const HOY = '2026-07-20';

const CATALOGO: Ejercicio[] = [
  {
    id: 'F1', nombre_es: 'Press banca', nombre_en: 'Bench press', tipo: 'fuerza', grupo: 'pesas',
    equipment: 'barra', zona: 'tren superior', musculo: 'pectorales', secundarios: [], pasos: [],
    movimiento: 'empuje-pectorales', basico: true,
  },
];

function sesionFuerza(extra: Partial<Sesion> = {}): Sesion {
  return {
    id: 's1',
    fecha: '2026-07-18',
    tipo: 'fuerza',
    estado: 'hecha',
    diaRutina: 'Día 1 — Empuje',
    items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }],
    ...extra,
  };
}

/** Arma el DOM que la página le da al módulo. */
function montar(respuestas: boolean[] = []) {
  document.body.innerHTML = `
    <div id="calendario"></div>
    <button id="btn-cardio">+ Registrar cardio</button>
    <div id="alta-cardio"></div>
    <div id="sesiones"></div>`;
  const preguntas: string[] = [];
  let i = 0;
  montarHistorial({
    raiz: document,
    catalogo: CATALOGO,
    hoy: () => HOY,
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
  });
  return { preguntas };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const botonAccion = (accion: string) => $(`#sesiones [data-accion="${accion}"]`);

beforeEach(() => {
  localStorage.clear();
});

describe('listado', () => {
  it('muestra la sesión con su día y su detalle', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    const texto = $('#sesiones').textContent!;
    expect(texto).toContain('2026-07-18');
    expect(texto).toContain('Día 1 — Empuje');
    expect(texto).toContain('Press banca');
    expect(texto).toContain('10×20kg');
  });

  it('sin sesiones muestra el mensaje vacío y no rompe', () => {
    montar();
    expect($('#sesiones').textContent).toContain('Todavía no hay sesiones');
  });

  it('muestra los salteados como salteados, no como una línea vacía', () => {
    storage.setSesiones([
      sesionFuerza({ items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }] }),
    ]);
    montar();
    expect($('#sesiones').textContent).toContain('Press banca: salteado');
  });
});

describe('editar', () => {
  it('abre el formulario con los valores actuales', () => {
    storage.setSesiones([sesionFuerza({ rpe: 8 })]);
    montar();
    botonAccion('editar').click();
    expect(($('[data-campo="fecha"]') as HTMLInputElement).value).toBe('2026-07-18');
    expect(($('[data-campo="rpe"]') as HTMLInputElement).value).toBe('8');
    expect(($('[data-serie-campo="peso"]') as HTMLInputElement).value).toBe('20');
  });

  it('guarda el peso corregido en storage', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    ($('[data-serie-campo="peso"]') as HTMLInputElement).value = '25';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.series[0]!.pesoKg).toBe(25);
  });

  it('un valor inválido muestra el error y NO toca storage', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    ($('[data-campo="rpe"]') as HTMLInputElement).value = '99';
    botonAccion('guardar').click();
    expect($('[data-errores]').textContent).toContain('RPE');
    expect(storage.getSesiones()[0]!.rpe).toBeUndefined();
  });

  it('si se cancela la confirmación no se guarda nada', () => {
    storage.setSesiones([sesionFuerza()]);
    montar([false]);
    botonAccion('editar').click();
    ($('[data-campo="fecha"]') as HTMLInputElement).value = '2026-07-01';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.fecha).toBe('2026-07-18');
  });

  it('cancelar cierra el panel sin tocar el dato', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    botonAccion('cancelar').click();
    expect($('[data-panel]')).toBeNull();
    expect(storage.getSesiones()).toHaveLength(1);
  });
});

describe('borrar', () => {
  it('pregunta dos veces y recién ahí borra', () => {
    storage.setSesiones([sesionFuerza()]);
    const { preguntas } = montar([true, true]);
    botonAccion('borrar').click();
    expect(preguntas).toHaveLength(2);
    expect(preguntas[0]).toContain('¿Borrar esta sesión?');
    expect(preguntas[1]).toContain('no se puede deshacer');
    expect(storage.getSesiones()).toHaveLength(0);
  });

  it('cortar en la primera pregunta no borra ni vuelve a preguntar', () => {
    storage.setSesiones([sesionFuerza()]);
    const { preguntas } = montar([false]);
    botonAccion('borrar').click();
    expect(preguntas).toHaveLength(1);
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('cortar en la segunda pregunta tampoco borra', () => {
    storage.setSesiones([sesionFuerza()]);
    montar([true, false]);
    botonAccion('borrar').click();
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('borra la sesión correcta cuando hay varias', () => {
    storage.setSesiones([
      sesionFuerza({ id: 's1', fecha: '2026-07-16' }),
      sesionFuerza({ id: 's2', fecha: '2026-07-18' }),
      sesionFuerza({ id: 's3', fecha: '2026-07-19' }),
    ]);
    montar([true, true]);
    // El listado ordena por fecha desc: el primer "Borrar" es el de s3.
    $$('#sesiones [data-accion="borrar"]')[0]!.click();
    expect(storage.getSesiones().map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('alta de cardio', () => {
  it('registra la sesión con tipo, minutos y km', () => {
    montar();
    $('#btn-cardio').click();
    $('[data-tipo="bicicleta"]').click();
    ($('#cardio-min') as HTMLInputElement).value = '45';
    ($('#cardio-km') as HTMLInputElement).value = '15';
    ($('#cardio-fecha') as HTMLInputElement).value = HOY;
    $('#cardio-guardar').click();
    const guardada = storage.getSesiones()[0]!;
    expect(guardada.tipo).toBe('cardio');
    expect(guardada.cardio).toMatchObject({ tipo: 'bicicleta', minutos: 45, km: 15 });
    expect(guardada.id).toBeTruthy();
  });

  it('una fecha de hace más de 7 días se rechaza con mensaje', () => {
    montar();
    $('#btn-cardio').click();
    $('[data-tipo="cinta"]').click();
    ($('#cardio-fecha') as HTMLInputElement).value = '2026-06-01';
    $('#cardio-guardar').click();
    expect($('#cardio-error').textContent).toContain('últimos 7 días');
    expect(storage.getSesiones()).toHaveLength(0);
  });
});
