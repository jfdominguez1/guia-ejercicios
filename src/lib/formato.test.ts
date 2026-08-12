import { describe, it, expect } from 'vitest';
import { unidadEfectiva, formatearObjetivo, formatearFc, etiquetaDescanso, instruccionDosis } from './formato';
import type { EjercicioRutina } from './tipos';

function ejRutina(extras: Partial<EjercicioRutina> = {}): EjercicioRutina {
  return {
    movimiento: 'empuje-pectorales',
    ejercicioId: '0001',
    series: 3,
    repsMin: 8,
    repsMax: 12,
    descansoSeg: 90,
    ...extras,
  };
}

describe('unidadEfectiva — retrocompatibilidad', () => {
  it('sin unidad → reps (rutinas viejas)', () => {
    expect(unidadEfectiva(ejRutina(), 'fuerza')).toBe('reps');
  });

  it('sin unidad pero ejercicio de elongación → seg', () => {
    expect(unidadEfectiva(ejRutina(), 'elongacion')).toBe('seg');
  });

  it('unidad explícita gana siempre', () => {
    expect(unidadEfectiva(ejRutina({ unidad: 'min' }), 'fuerza')).toBe('min');
    expect(unidadEfectiva(ejRutina({ unidad: 'reps' }), 'elongacion')).toBe('reps');
  });
});

describe('formatearObjetivo', () => {
  it('reps: "8-12 reps"', () => {
    expect(formatearObjetivo(ejRutina(), 'fuerza')).toBe('8-12 reps');
  });

  it('min: "2-5 min" y colapsa rango igual a "5 min"', () => {
    expect(formatearObjetivo(ejRutina({ unidad: 'min', repsMin: 2, repsMax: 5 }), 'cardio')).toBe('2-5 min');
    expect(formatearObjetivo(ejRutina({ unidad: 'min', repsMin: 5, repsMax: 5 }), 'cardio')).toBe('5 min');
  });

  it('elongación sin unidad: "20-30 seg"', () => {
    expect(formatearObjetivo(ejRutina({ repsMin: 20, repsMax: 30 }), 'elongacion')).toBe('20-30 seg');
  });
});

describe('formatearFc', () => {
  it('con fcObjetivo → "🫀 125-140 ppm"', () => {
    expect(formatearFc(ejRutina({ fcObjetivo: { min: 125, max: 140 } }))).toBe('🫀 125-140 ppm');
  });

  it('sin fcObjetivo → null', () => {
    expect(formatearFc(ejRutina())).toBeNull();
  });
});

describe('etiquetaDescanso', () => {
  it('cardio (min) con series > 1 → recuperación', () => {
    expect(etiquetaDescanso(ejRutina({ unidad: 'min', series: 6 }), 'cardio')).toBe('recuperación');
  });

  it('cardio de un solo bloque y fuerza → descanso', () => {
    expect(etiquetaDescanso(ejRutina({ unidad: 'min', series: 1 }), 'cardio')).toBe('descanso');
    expect(etiquetaDescanso(ejRutina(), 'fuerza')).toBe('descanso');
  });
});

// JFD: "no sé si son 30 segundos en total o por pierna", y "el número se lee
// igual sea aguantar el estiramiento o repetirlo despacio".
describe('porLado', () => {
  it('sin el campo el número es el total — lo de siempre, nada viejo cambia', () => {
    expect(formatearObjetivo(ejRutina({ unidad: 'seg', repsMin: 20, repsMax: 30 }), 'elongacion'))
      .toBe('20-30 seg');
    expect(instruccionDosis(ejRutina({ unidad: 'seg', repsMin: 20, repsMax: 30 }), 'elongacion'))
      .toBe('Sostené 20-30 seg');
  });

  it('con el campo, el número es por lado y se dice', () => {
    const e = ejRutina({ unidad: 'seg', repsMin: 20, repsMax: 30, porLado: true });
    expect(formatearObjetivo(e, 'elongacion')).toBe('20-30 seg por lado');
    expect(instruccionDosis(e, 'elongacion')).toBe('Sostené 20-30 seg de cada lado');
  });
});

describe('instruccionDosis — sostener vs repetir', () => {
  it('elongación por tiempo → "Sostené"', () => {
    expect(instruccionDosis(ejRutina({ unidad: 'seg', repsMin: 30, repsMax: 40 }), 'elongacion'))
      .toBe('Sostené 30-40 seg');
  });

  it('elongación por repeticiones → "repeticiones lentas"', () => {
    expect(instruccionDosis(ejRutina({ unidad: 'reps', repsMin: 5, repsMax: 8 }), 'elongacion'))
      .toBe('5-8 repeticiones lentas');
  });

  it('en fuerza las repeticiones no son lentas', () => {
    expect(instruccionDosis(ejRutina({ repsMin: 8, repsMax: 12 }), 'fuerza'))
      .toBe('8-12 repeticiones');
  });

  it('la plancha se sostiene aunque sea de fuerza', () => {
    expect(instruccionDosis(ejRutina({ unidad: 'seg', repsMin: 45, repsMax: 45 }), 'fuerza'))
      .toBe('Sostené 45 seg');
  });

  it('cardio en minutos', () => {
    expect(instruccionDosis(ejRutina({ unidad: 'min', repsMin: 30, repsMax: 40 }), 'cardio'))
      .toBe('30-40 min');
  });
});
