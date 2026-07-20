// Feature: kg y libras juntas. El dato se guarda SIEMPRE en kg; la libra es
// una lectura extra para las máquinas rotuladas en lb.
import { describe, it, expect } from 'vitest';
import {
  aKg,
  ajustarPeso,
  desdeKg,
  equivalente,
  formatearPeso,
  kgALb,
  lbAKg,
  resumenSeries,
} from './unidades';

describe('conversión', () => {
  it('convierte kg a lb y al revés', () => {
    expect(kgALb(20)).toBe(44.1);
    expect(kgALb(100)).toBe(220.5);
    expect(lbAKg(45)).toBe(20.41);
  });

  it('la libra se muestra con 1 decimal, no con cinco', () => {
    expect(String(kgALb(20))).toBe('44.1');
    expect(String(kgALb(37.5))).toBe('82.7');
  });

  it('ida y vuelta no acumula deriva', () => {
    // El riesgo real: abrir una sesión, guardarla sin tocar nada y que el peso
    // cambie solo. Con redondeo a 0,5 el valor tiene que quedarse quieto.
    for (const kg of [2.5, 5, 10, 20, 22.5, 40, 60, 100]) {
      const ida = desdeKg(kg, 'lb');
      const vuelta = aKg(ida, 'lb');
      expect(Math.abs(vuelta - kg)).toBeLessThanOrEqual(0.05);
      // Y estabiliza: repetir la operación no lo sigue moviendo.
      expect(aKg(desdeKg(vuelta, 'lb'), 'lb')).toBe(vuelta);
    }
  });

  it('en kg no toca nada', () => {
    expect(aKg(22.5, 'kg')).toBe(22.5);
    expect(desdeKg(22.5, 'kg')).toBe(22.5);
  });

  it('un valor tipeado en libras vuelve a mostrarse igual (el bug que se escapó)', () => {
    // 50 lb -> kg -> 50 lb. Con kg redondeado a 0,5 esto daba 49,5.
    for (const lb of [5, 10, 25, 45, 50, 90, 135]) {
      expect(desdeKg(aKg(lb, 'lb'), 'lb')).toBe(lb);
    }
  });
});

describe('formatearPeso', () => {
  it('muestra las dos unidades', () => {
    expect(formatearPeso(20)).toBe('20 kg · 44,1 lb');
  });

  it('usa coma decimal y sin decimales cuando es entero', () => {
    expect(formatearPeso(22.5)).toBe('22,5 kg · 49,6 lb');
  });
});

describe('equivalente', () => {
  it('da la otra unidad para el hint del input', () => {
    expect(equivalente(20, 'kg')).toBe('44,1 lb');
    expect(equivalente(45, 'lb')).toBe('20,4 kg');
  });

  it('vacío si no hay valor útil', () => {
    expect(equivalente(0, 'kg')).toBe('');
    expect(equivalente(NaN, 'kg')).toBe('');
  });
});

describe('ajustarPeso', () => {
  it('sube y baja por el paso de la unidad', () => {
    expect(ajustarPeso(20, 'kg', 1)).toBe(22.5);
    expect(ajustarPeso(20, 'kg', -1)).toBe(17.5);
  });

  it('en libras se mueve de a 5 lb, no de a 2,5 kg', () => {
    // 20 kg = 44,1 lb -> siguiente muesca de 5 = 45 lb = 20,41 kg
    expect(desdeKg(ajustarPeso(20, 'lb', 1), 'lb')).toBe(45);
  });

  it('nunca baja de cero', () => {
    expect(ajustarPeso(0, 'kg', -1)).toBe(0);
    expect(ajustarPeso(undefined, 'kg', -1)).toBe(0);
  });

  it('desde vacío arranca en el primer paso', () => {
    expect(ajustarPeso(undefined, 'kg', 1)).toBe(2.5);
  });
});

describe('resumenSeries', () => {
  it('resume series parejas con las dos unidades', () => {
    expect(resumenSeries([{ reps: 10, pesoKg: 20 }, { reps: 10, pesoKg: 20 }, { reps: 10, pesoKg: 20 }]))
      .toBe('3×10 · 20 kg · 44,1 lb');
  });

  it('lista las reps cuando no son todas iguales', () => {
    expect(resumenSeries([{ reps: 12, pesoKg: 20 }, { reps: 10, pesoKg: 20 }])).toBe('12/10 · 20 kg · 44,1 lb');
  });

  it('muestra el rango si el peso subió entre series', () => {
    expect(resumenSeries([{ reps: 10, pesoKg: 20 }, { reps: 8, pesoKg: 25 }])).toBe('10/8 · 20–25 kg · 55,1 lb');
  });

  it('sin peso muestra solo las reps', () => {
    expect(resumenSeries([{ reps: 15 }, { reps: 15 }])).toBe('2×15');
  });

  it('sin series no muestra nada', () => {
    expect(resumenSeries([])).toBe('');
  });
});
