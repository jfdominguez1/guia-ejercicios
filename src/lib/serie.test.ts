import { describe, expect, it } from 'vitest';

import { conMedida, formatearCrono, formatearMedida, medidaSerie, valorPrecargado } from './serie';

describe('medidaSerie', () => {
  it('sin campos de tiempo son repeticiones', () => {
    expect(medidaSerie({ reps: 12 })).toEqual({ valor: 12, unidad: 'reps' });
  });

  it('con segundos manda el tiempo, no reps', () => {
    expect(medidaSerie({ reps: 40, segundos: 40 })).toEqual({ valor: 40, unidad: 'seg' });
  });

  it('con minutos manda el tiempo', () => {
    expect(medidaSerie({ reps: 35, minutos: 35 })).toEqual({ valor: 35, unidad: 'min' });
  });
});

describe('conMedida', () => {
  it('en reps guarda el peso y no ensucia con campos de tiempo', () => {
    expect(conMedida({ reps: 0, pesoKg: 20 }, 10, 'reps')).toEqual({ reps: 10, pesoKg: 20 });
  });

  it('en segundos guarda el valor con nombre y espeja reps', () => {
    expect(conMedida({ reps: 0 }, 45, 'seg')).toEqual({ reps: 45, segundos: 45 });
  });

  it('un ejercicio por tiempo no arrastra peso', () => {
    expect(conMedida({ reps: 30, pesoKg: 20 }, 40, 'seg')).toEqual({ reps: 40, segundos: 40 });
  });

  it('cambiar de unidad limpia la unidad anterior', () => {
    const enSegundos = conMedida({ reps: 0 }, 40, 'seg');
    expect(conMedida(enSegundos, 3, 'min')).toEqual({ reps: 3, minutos: 3 });
    expect(conMedida(enSegundos, 8, 'reps')).toEqual({ reps: 8 });
  });

  it('ida y vuelta: lo que se guarda es lo que se lee', () => {
    for (const unidad of ['reps', 'seg', 'min'] as const) {
      expect(medidaSerie(conMedida({ reps: 0 }, 33, unidad))).toEqual({ valor: 33, unidad });
    }
  });
});

describe('presentación', () => {
  it('el número nunca viaja sin unidad', () => {
    expect(formatearMedida({ valor: 40, unidad: 'seg' })).toBe('40 seg');
  });

  it('el cronómetro se lee como reloj', () => {
    expect(formatearCrono(9)).toBe('0:09');
    expect(formatearCrono(65)).toBe('1:05');
    expect(formatearCrono(600)).toBe('10:00');
  });
});

describe('valorPrecargado — no reinterpretar un registro de otra unidad', () => {
  it('reusa el valor anterior cuando la unidad coincide', () => {
    expect(valorPrecargado({ reps: 12 }, 'reps', 8)).toBe(12);
    expect(valorPrecargado({ reps: 40, segundos: 40 }, 'seg', 30)).toBe(40);
  });

  it('sin registro anterior usa el plan', () => {
    expect(valorPrecargado(undefined, 'seg', 30)).toBe(30);
  });

  /**
   * El caso real: la elongación del 02/08 precargó 5 y 10 segundos tomándolos
   * de sesiones de julio registradas en reps (antes de que la app distinguiera
   * unidades), en ejercicios cuyo plan pedía 30-40 seg. El número quedaba
   * guardado como si se hubiera medido.
   */
  it('descarta el valor anterior si se midió en otra unidad', () => {
    expect(valorPrecargado({ reps: 5 }, 'seg', 30)).toBe(30);
    expect(valorPrecargado({ reps: 10 }, 'seg', 30)).toBe(30);
    expect(valorPrecargado({ reps: 30, minutos: 30 }, 'seg', 40)).toBe(40);
    expect(valorPrecargado({ reps: 40, segundos: 40 }, 'reps', 12)).toBe(12);
  });
});
