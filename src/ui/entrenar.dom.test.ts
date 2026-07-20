// @vitest-environment jsdom
// Feature: el wizard de entrenamiento de punta a punta. Es la pantalla donde
// más tiempo se pasa y la que más estado maneja (draft, swaps, salteos), así
// que se ejercita con el DOM real y no solo su lógica.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarEntrenar } from './entrenar';
import { storage } from '../lib/storage';
import type { Ejercicio, Perfil, Rutina } from '../lib/tipos';

const HOY = '2026-07-20';

function ej(id: string, nombre: string, movimiento: string, grupo: Ejercicio['grupo'], musculo = 'pectorales'): Ejercicio {
  return {
    id, nombre_es: nombre, nombre_en: nombre, tipo: 'fuerza', grupo, equipment: 'x',
    zona: 'tren superior', musculo, secundarios: [], pasos: ['Paso uno'], movimiento, basico: true,
  };
}

const PRESS = ej('F1', 'Press banca', 'empuje-pectorales', 'pesas');
const PRESS_MAQ = ej('F2', 'Press en máquina', 'empuje-pectorales', 'maquina');
const APERTURA = ej('F3', 'Aperturas', 'apertura-pectorales', 'pesas');
const REMO = ej('F4', 'Remo', 'traccion-dorsales', 'pesas', 'dorsales');
const CATALOGO = [PRESS, PRESS_MAQ, APERTURA, REMO];

const PERFIL: Perfil = {
  edad: 45, dias: 3, nivel: 'entrenado', objetivo: 'musculo', equipamiento: ['pesas', 'maquina'],
};

function rutina(): Rutina {
  return {
    generadaEl: HOY,
    seed: 1,
    origen: 'reglas',
    dias: [
      {
        nombre: 'Día 1 — Empuje',
        enfoque: 'pecho y hombros',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 2, repsMin: 8, repsMax: 12, descansoSeg: 90 },
          { movimiento: 'traccion-dorsales', ejercicioId: 'F4', series: 2, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
      { nombre: 'Día 2 — Piernas', enfoque: 'piernas', ejercicios: [] },
    ],
  };
}

function montar() {
  document.body.innerHTML = '<div id="wizard"></div>';
  const rutas: string[] = [];
  montarEntrenar({
    contenedor: document.querySelector('#wizard') as HTMLElement,
    catalogo: CATALOGO,
    perfil: PERFIL,
    hoy: () => HOY,
    navegar: (ruta) => rutas.push(ruta),
  });
  return { rutas };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const texto = () => $('#wizard').textContent!;
const leerDraft = () => JSON.parse(localStorage.getItem('ge:draft')!);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  storage.setPerfil(PERFIL);
  storage.setRutina(rutina());
});

describe('arranque', () => {
  it('muestra el primer ejercicio del día con su objetivo y progreso', () => {
    montar();
    expect(texto()).toContain('Press banca');
    expect(texto()).toContain('Día 1 — Empuje');
    expect(texto()).toContain('1/2');
    expect(texto()).toContain('Objetivo: 2×');
  });

  it('sin rutina manda al perfil en vez de romper', () => {
    localStorage.removeItem('ge:rutina');
    const { rutas } = montar();
    expect(rutas).toEqual(['/perfil/']);
  });

  it('arranca una serie por cada serie planificada', () => {
    montar();
    expect($$('.serie')).toHaveLength(2);
  });
});

describe('marcar series', () => {
  it('tocar el círculo marca la serie y queda en el draft', () => {
    montar();
    $$('.serie .check')[0]!.click();
    expect($$('.serie')[0]!.className).toContain('hecha');
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(true);
  });

  it('tocarlo de nuevo la desmarca', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $$('.serie .check')[0]!.click();
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(false);
  });

  it('el peso tipeado se guarda en el draft', () => {
    montar();
    const peso = $$('.serie [data-campo="peso"]')[0] as HTMLInputElement;
    peso.value = '22.5';
    peso.dispatchEvent(new Event('change'));
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5);
  });
});

describe('navegación', () => {
  it('Siguiente pasa al segundo ejercicio', () => {
    montar();
    $('#btn-siguiente').click();
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
  });

  it('Anterior vuelve, y en el primero está deshabilitado', () => {
    montar();
    expect(($('#btn-anterior') as HTMLButtonElement).disabled).toBe(true);
    $('#btn-siguiente').click();
    $('#btn-anterior').click();
    expect(texto()).toContain('Press banca');
  });

  it('después del último ejercicio aparece el resumen', () => {
    montar();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    expect(texto()).toContain('¡Terminaste!');
  });
});

describe('saltear', () => {
  it('saltea y avanza al siguiente', () => {
    montar();
    $('#btn-saltear').click();
    expect(texto()).toContain('Remo');
    expect(leerDraft().ejercicios[0].salteado).toBe(true);
  });

  it('el salteado aparece en el resumen y se guarda como salteado', () => {
    const { rutas } = montar();
    $('#btn-saltear').click();
    $('#btn-siguiente').click();
    expect(texto()).toContain('1 salteado');
    $('#btn-guardar').click();
    const items = storage.getSesiones()[0]!.items!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ejercicioId: 'F1', salteado: true });
    expect(rutas).toEqual(['/']);
  });
});

describe('cambiar ejercicio', () => {
  it('ofrece el equivalente de otro implemento y el del mismo músculo', () => {
    montar();
    $('#btn-cambiar').click();
    expect(texto()).toContain('Press en máquina'); // mismo movimiento
    expect(texto()).toContain('Aperturas'); // mismo músculo
    expect(texto()).not.toContain('Remo'); // otro músculo: no se ofrece
  });

  it('buscar en el catálogo filtra por nombre', () => {
    montar();
    $('#btn-cambiar').click();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'remo';
    buscador.dispatchEvent(new Event('input'));
    expect(texto()).toContain('Remo');
  });

  it('"solo por hoy" cambia el wizard pero NO la rutina', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    expect(texto()).toContain('¿Hasta cuándo?');
    $('[data-alcance="hoy"]').click();
    expect(texto()).toContain('Press en máquina');
    expect(texto()).toContain('en lugar de Press banca');
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
  });

  it('"cambiarlo en la rutina" sí la modifica', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    $('[data-alcance="siempre"]').click();
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F2');
    // Ya es el ejercicio de la rutina: no se muestra como reemplazo temporal.
    expect(texto()).not.toContain('en lugar de');
  });

  it('volver sin cambiar deja todo como estaba', () => {
    montar();
    $('#btn-cambiar').click();
    $('#btn-cancelar-cambio').click();
    expect(texto()).toContain('Press banca');
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
  });

  it('el cambio por hoy queda registrado como enLugarDe en la sesión', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    $('[data-alcance="hoy"]').click();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]).toMatchObject({ ejercicioId: 'F2', enLugarDe: 'F1' });
  });
});

describe('guardar la sesión', () => {
  it('guarda solo las series marcadas y limpia el draft', () => {
    const { rutas } = montar();
    $$('.serie .check')[0]!.click(); // solo la primera serie
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.items).toHaveLength(1);
    expect(sesion.items![0]!.series).toHaveLength(1);
    expect(sesion.diaRutina).toBe('Día 1 — Empuje');
    expect(sesion.diaIndex).toBe(0);
    expect(localStorage.getItem('ge:draft')).toBeNull();
    expect(rutas).toEqual(['/']);
  });

  it('sin nada marcado igual registra la sesión, sin items', () => {
    montar();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.estado).toBe('hecha');
    expect(sesion.items).toBeUndefined();
  });
});

describe('draft', () => {
  it('al volver a entrar retoma donde estabas', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    montar(); // simula recargar la página
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
  });

  it('si la rutina cambió de largo, el draft viejo se descarta', () => {
    montar();
    $('#btn-siguiente').click();
    const r = rutina();
    r.dias[0]!.ejercicios.pop();
    storage.setRutina(r);
    montar();
    expect(texto()).toContain('1/1');
    expect(texto()).toContain('Press banca');
  });
});

describe('día elegido a mano', () => {
  it('respeta el override de "hacer otro día"', () => {
    const r = rutina();
    r.dias[1]!.ejercicios = [
      { movimiento: 'traccion-dorsales', ejercicioId: 'F4', series: 1, repsMin: 8, repsMax: 12, descansoSeg: 90 },
    ];
    storage.setRutina(r);
    sessionStorage.setItem('ge:dia', JSON.stringify({ fecha: HOY, diaIndex: 1 }));
    montar();
    expect(texto()).toContain('Día 2 — Piernas');
    expect(texto()).toContain('Remo');
  });
});

describe('kg y libras', () => {
  const peso = (i = 0) => $$('.serie [data-campo="peso"]')[i] as HTMLInputElement;
  const tipearPeso = (valor: string, i = 0) => {
    peso(i).value = valor;
    peso(i).dispatchEvent(new Event('change'));
  };

  it('muestra la referencia de la última vez en kg Y en lb', () => {
    storage.agregarSesion({
      fecha: '2026-07-15', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }, { reps: 10, pesoKg: 20 }] }],
    });
    montar();
    expect($('.dato-referencia').textContent).toBe('2×10 · 20 kg · 44,1 lb');
  });

  it('si nunca lo hiciste lo dice sin culpa', () => {
    montar();
    expect($('.dato-referencia').textContent).toContain('Nunca lo hiciste');
  });

  it('en kg guarda lo tipeado tal cual', () => {
    montar();
    tipearPeso('22.5');
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5);
  });

  it('en lb convierte a kg antes de guardar', () => {
    storage.setConfig({ ...storage.getConfig(), unidadEntrada: 'lb' });
    montar();
    tipearPeso('45'); // 45 lb = 20,41 kg
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20.41);
  });

  it('al cambiar de unidad el input se reexpresa sin cambiar el dato', () => {
    montar();
    tipearPeso('20');
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20);
    $('[data-unidad="lb"]').click();
    expect(peso().value).toBe('44.1');
    // El dato guardado sigue siendo el mismo: solo cambió cómo se muestra.
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20);
  });

  it('muestra el equivalente en la otra unidad al lado', () => {
    montar();
    tipearPeso('20');
    expect($('[data-equiv="0"]').textContent).toBe('44,1 lb');
  });

  it('el botón + sube por el paso de la unidad activa', () => {
    montar();
    tipearPeso('20');
    $('[data-paso="1"]').click();
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5); // +2,5 kg
  });

  it('en libras el botón + sube de a 5 lb, no de a 2,5 kg', () => {
    storage.setConfig({ ...storage.getConfig(), unidadEntrada: 'lb' });
    montar();
    tipearPeso('45');
    $('[data-paso="1"]').click();
    expect(peso().value).toBe('50');
  });

  it('el botón − no baja de cero', () => {
    montar();
    $('[data-paso="-1"]').click();
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBeUndefined();
  });

  it('la unidad elegida se recuerda entre sesiones', () => {
    montar();
    $('[data-unidad="lb"]').click();
    expect(storage.getConfig().unidadEntrada).toBe('lb');
    montar();
    expect($('[data-unidad="lb"]').getAttribute('aria-pressed')).toBe('true');
  });
});
