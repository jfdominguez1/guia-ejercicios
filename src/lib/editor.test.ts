// Feature: edición manual de la rutina (ver, ajustar dosis, sustituir,
// quitar y agregar ejercicios) sin regenerarla entera.
import { describe, it, expect } from 'vitest';
import {
  actualizarDosis,
  agregarEjercicio,
  buscarEjercicios,
  dosisInicial,
  quitarEjercicio,
  sustituirEjercicio,
} from './editor';
import type { Ejercicio, Rutina } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo'], movimiento: string, nombre = id): Ejercicio {
  return {
    id, nombre_es: nombre, nombre_en: nombre, tipo, grupo: 'pesas', equipment: 'x',
    zona: 'z', musculo: 'pectorales', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const PRESS = ej('F1', 'fuerza', 'empuje-pectorales', 'Press banca');
const REMO = ej('F2', 'fuerza', 'traccion-dorsales', 'Remo con barra');
const CINTA = ej('C1', 'cardio', 'otro-sistema-cardiovascular', 'Cinta');
const ESTIRAMIENTO = ej('E1', 'elongacion', 'estiramiento-pectorales', 'Estiramiento de pecho');

function rutinaBase(): Rutina {
  return {
    generadaEl: '2026-07-01',
    seed: 1,
    origen: 'reglas',
    dias: [
      {
        nombre: 'Día 1',
        enfoque: 'full',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
          { movimiento: 'traccion-dorsales', ejercicioId: 'F2', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
      {
        nombre: 'Día Cinta',
        enfoque: 'cardio',
        ejercicios: [
          {
            movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'C1', series: 6,
            repsMin: 2, repsMax: 2, unidad: 'min', fcObjetivo: { min: 120, max: 140 }, descansoSeg: 180,
          },
        ],
      },
    ],
  };
}

describe('actualizarDosis', () => {
  it('cambia series y rango sin mutar la rutina original', () => {
    const original = rutinaBase();
    const nueva = actualizarDosis(original, 0, 0, { series: 4, repsMin: 6, repsMax: 10 });
    expect(nueva.dias[0]!.ejercicios[0]).toMatchObject({ series: 4, repsMin: 6, repsMax: 10 });
    expect(original.dias[0]!.ejercicios[0]!.series).toBe(3); // inmutable
    expect(nueva.dias[0]!.ejercicios[1]).toEqual(original.dias[0]!.ejercicios[1]);
  });

  it('acota series a 1-6 y fuerza repsMax >= repsMin', () => {
    const conTope = actualizarDosis(rutinaBase(), 0, 0, { series: 9, repsMin: 15, repsMax: 10 });
    expect(conTope.dias[0]!.ejercicios[0]).toMatchObject({ series: 6, repsMin: 15, repsMax: 15 });
    const conPiso = actualizarDosis(rutinaBase(), 0, 0, { series: 0, repsMin: 0 });
    expect(conPiso.dias[0]!.ejercicios[0]!.series).toBe(1);
    expect(conPiso.dias[0]!.ejercicios[0]!.repsMin).toBe(1);
  });

  it('puede cambiar el descanso, acotado a 0-600 segundos', () => {
    const nueva = actualizarDosis(rutinaBase(), 0, 0, { descansoSeg: 9999 });
    expect(nueva.dias[0]!.ejercicios[0]!.descansoSeg).toBe(600);
  });

  it('con índices inválidos devuelve la rutina tal cual', () => {
    const original = rutinaBase();
    expect(actualizarDosis(original, 5, 0, { series: 4 })).toBe(original);
    expect(actualizarDosis(original, 0, 99, { series: 4 })).toBe(original);
  });
});

describe('sustituirEjercicio', () => {
  it('mismo tipo: cambia id y movimiento, conserva la dosis', () => {
    const nueva = sustituirEjercicio(rutinaBase(), 0, 0, REMO);
    expect(nueva.dias[0]!.ejercicios[0]).toMatchObject({
      ejercicioId: 'F2', movimiento: 'traccion-dorsales', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90,
    });
  });

  it('fuerza → cardio: pasa la unidad a minutos', () => {
    const nueva = sustituirEjercicio(rutinaBase(), 0, 0, CINTA);
    expect(nueva.dias[0]!.ejercicios[0]!.unidad).toBe('min');
  });

  it('cardio → fuerza: vuelve a reps y pierde la zona de FC', () => {
    const nueva = sustituirEjercicio(rutinaBase(), 1, 0, PRESS);
    const e = nueva.dias[1]!.ejercicios[0]!;
    expect(e.unidad).toBeUndefined();
    expect(e.fcObjetivo).toBeUndefined();
  });

  it('cardio → cardio: conserva unidad y zona de FC', () => {
    const otraCinta = ej('C2', 'cardio', 'otro-sistema-cardiovascular', 'Elíptica');
    const e = sustituirEjercicio(rutinaBase(), 1, 0, otraCinta).dias[1]!.ejercicios[0]!;
    expect(e.unidad).toBe('min');
    expect(e.fcObjetivo).toEqual({ min: 120, max: 140 });
  });

  it('a elongación: la unidad pasa a segundos', () => {
    const e = sustituirEjercicio(rutinaBase(), 0, 0, ESTIRAMIENTO).dias[0]!.ejercicios[0]!;
    expect(e.unidad).toBe('seg');
  });

  it('con índices inválidos devuelve la rutina tal cual', () => {
    const original = rutinaBase();
    expect(sustituirEjercicio(original, 9, 0, REMO)).toBe(original);
  });
});

describe('quitarEjercicio', () => {
  it('saca solo ese ejercicio del día', () => {
    const nueva = quitarEjercicio(rutinaBase(), 0, 0);
    expect(nueva.dias[0]!.ejercicios.map((e) => e.ejercicioId)).toEqual(['F2']);
    expect(nueva.dias[1]!.ejercicios).toHaveLength(1);
  });

  it('con índices inválidos devuelve la rutina tal cual', () => {
    const original = rutinaBase();
    expect(quitarEjercicio(original, 0, 5)).toBe(original);
  });
});

describe('agregarEjercicio + dosisInicial', () => {
  it('agrega al final del día con la dosis default de fuerza', () => {
    const nueva = agregarEjercicio(rutinaBase(), 0, REMO);
    expect(nueva.dias[0]!.ejercicios).toHaveLength(3);
    expect(nueva.dias[0]!.ejercicios[2]).toMatchObject({
      ejercicioId: 'F2', movimiento: 'traccion-dorsales', series: 3, repsMin: 8, repsMax: 12,
    });
  });

  it('la dosis default depende del tipo', () => {
    expect(dosisInicial('fuerza').unidad).toBeUndefined();
    expect(dosisInicial('elongacion')).toMatchObject({ series: 1, unidad: 'seg' });
    expect(dosisInicial('cardio')).toMatchObject({ series: 1, unidad: 'min' });
  });

  it('con día inválido devuelve la rutina tal cual', () => {
    const original = rutinaBase();
    expect(agregarEjercicio(original, 7, REMO)).toBe(original);
  });
});

describe('buscarEjercicios', () => {
  const CATALOGO = [PRESS, REMO, CINTA, ESTIRAMIENTO];

  it('busca por nombre sin importar mayúsculas ni acentos', () => {
    expect(buscarEjercicios(CATALOGO, 'PRESS').map((e) => e.id)).toEqual(['F1']);
    expect(buscarEjercicios(CATALOGO, 'estiramiento').map((e) => e.id)).toEqual(['E1']);
    const conAcento = [ej('EL1', 'cardio', 'otro', 'Elíptica')];
    expect(buscarEjercicios(conAcento, 'eliptica').map((e) => e.id)).toEqual(['EL1']);
    expect(buscarEjercicios(CATALOGO, 'elíptica')).toEqual([]); // no está en el catálogo
  });

  it('también matchea por músculo', () => {
    const ids = buscarEjercicios(CATALOGO, 'pectorales').map((e) => e.id);
    expect(ids).toContain('F1');
  });

  it('prioriza los que empiezan con el texto', () => {
    const catalogo = [ej('A', 'fuerza', 'm1', 'Curl de press'), ej('B', 'fuerza', 'm2', 'Press banca')];
    expect(buscarEjercicios(catalogo, 'press').map((e) => e.id)).toEqual(['B', 'A']);
  });

  it('con menos de 2 letras no devuelve nada y respeta el límite', () => {
    expect(buscarEjercicios(CATALOGO, 'p')).toEqual([]);
    const muchos = Array.from({ length: 30 }, (_, i) => ej(`X${i}`, 'fuerza', 'm', `Press ${i}`));
    expect(buscarEjercicios(muchos, 'press', 5)).toHaveLength(5);
  });
});
