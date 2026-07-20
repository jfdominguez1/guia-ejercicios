import { describe, expect, it } from 'vitest';
import {
  estimarE1RM,
  historialMovimiento,
  serieTope,
  sugerirProgresion,
  tendencia,
} from './progreso';
import type { Ejercicio, EjercicioRutina, SerieHecha, Sesion } from './tipos';

function ej(id: string, movimiento: string, tipo: Ejercicio['tipo'] = 'fuerza'): Ejercicio {
  return {
    id, nombre_es: id, nombre_en: id, tipo, grupo: 'pesas', equipment: 'x',
    zona: 'z', musculo: 'm', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const PRESS = ej('F1', 'empuje-pectorales');
const PRESS_MAQ = { ...ej('F2', 'empuje-pectorales'), grupo: 'maquina' as const };
const CATALOGO = [PRESS, PRESS_MAQ];

const plan = (repsMin: number, repsMax: number, extra: Partial<EjercicioRutina> = {}): EjercicioRutina => ({
  movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin, repsMax, descansoSeg: 90, ...extra,
});

function sesion(fecha: string, series: SerieHecha[], ejercicioId = 'F1', variante: 'pesas' | 'maquina' = 'pesas'): Sesion {
  return { fecha, tipo: 'fuerza', estado: 'hecha', items: [{ ejercicioId, variante, series }] };
}

describe('estimarE1RM (Epley)', () => {
  it('a 1 rep es el peso mismo', () => {
    expect(estimarE1RM(1, 40)).toBeCloseTo(41.3, 1); // 40 * (1 + 1/30)
  });
  it('crece con las reps al mismo peso', () => {
    expect(estimarE1RM(10, 20)).toBeGreaterThan(estimarE1RM(5, 20));
  });
});

describe('serieTope', () => {
  it('elige por e1RM, no por peso crudo', () => {
    // 20×10 (e1rm ~26,7) supera a 40×1 (e1rm ~41,3)? No: 41,3 > 26,7 → gana el pesado.
    expect(serieTope([{ reps: 10, pesoKg: 20 }, { reps: 1, pesoKg: 40 }])).toEqual({ reps: 1, pesoKg: 40 });
    // pero 20×12 (e1rm 28) supera a 22,5×3 (e1rm 24,75)
    expect(serieTope([{ reps: 12, pesoKg: 20 }, { reps: 3, pesoKg: 22.5 }])).toEqual({ reps: 12, pesoKg: 20 });
  });
  it('sin peso desempata por reps', () => {
    expect(serieTope([{ reps: 8 }, { reps: 12 }])).toEqual({ reps: 12 });
  });
  it('vacío es null', () => {
    expect(serieTope([])).toBeNull();
  });
});

describe('historialMovimiento', () => {
  it('un punto por sesión, ordenado del más viejo al más nuevo', () => {
    const sesiones = [
      sesion('2026-07-10', [{ reps: 10, pesoKg: 20 }]),
      sesion('2026-07-05', [{ reps: 10, pesoKg: 17.5 }]),
    ];
    const puntos = historialMovimiento(sesiones, 'empuje-pectorales', 'pesas', CATALOGO);
    expect(puntos.map((p) => p.fecha)).toEqual(['2026-07-05', '2026-07-10']);
    expect(puntos[1]!.pesoTope).toBe(20);
  });

  it('respeta la variante pedida (no mezcla pesas con máquina)', () => {
    const sesiones = [
      sesion('2026-07-05', [{ reps: 10, pesoKg: 20 }], 'F1', 'pesas'),
      sesion('2026-07-08', [{ reps: 10, pesoKg: 40 }], 'F2', 'maquina'),
    ];
    expect(historialMovimiento(sesiones, 'empuje-pectorales', 'pesas', CATALOGO)).toHaveLength(1);
    expect(historialMovimiento(sesiones, 'empuje-pectorales', 'maquina', CATALOGO)).toHaveLength(1);
  });

  it('ignora salteados y sesiones sin items', () => {
    const sesiones: Sesion[] = [
      { fecha: '2026-07-05', tipo: 'fuerza', estado: 'hecha', items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }] },
      { fecha: '2026-07-06', tipo: 'cardio', estado: 'otra' },
      sesion('2026-07-07', [{ reps: 8, pesoKg: 20 }]),
    ];
    expect(historialMovimiento(sesiones, 'empuje-pectorales', 'pesas', CATALOGO)).toHaveLength(1);
  });

  it('calcula el volumen del día', () => {
    const [p] = historialMovimiento([sesion('2026-07-07', [{ reps: 10, pesoKg: 20 }, { reps: 8, pesoKg: 20 }])], 'empuje-pectorales', 'pesas', CATALOGO);
    expect(p!.volumen).toBe(10 * 20 + 8 * 20);
  });
});

describe('tendencia', () => {
  it('null con menos de dos puntos', () => {
    expect(tendencia([])).toBeNull();
    expect(tendencia(historialMovimiento([sesion('2026-07-07', [{ reps: 8, pesoKg: 20 }])], 'empuje-pectorales', 'pesas', CATALOGO))).toBeNull();
  });
  it('mide el delta de peso tope en %', () => {
    const puntos = historialMovimiento([
      sesion('2026-07-01', [{ reps: 10, pesoKg: 15 }]),
      sesion('2026-07-20', [{ reps: 10, pesoKg: 25 }]),
    ], 'empuje-pectorales', 'pesas', CATALOGO);
    const t = tendencia(puntos)!;
    expect(t.primero.pesoTope).toBe(15);
    expect(t.ultimo.pesoTope).toBe(25);
    expect(t.deltaPesoPct).toBe(67);
  });
});

describe('sugerirProgresion (doble progresión)', () => {
  it('completó el tope del rango → sube el peso un paso y resetea reps', () => {
    const s = sugerirProgresion([{ reps: 12, pesoKg: 20 }, { reps: 12, pesoKg: 20 }, { reps: 12, pesoKg: 20 }], plan(8, 12), PRESS);
    expect(s.tipo).toBe('subir-peso');
    expect(s).toMatchObject({ pesoKg: 22.5, reps: 8 });
  });

  it('llegó al piso pero no al tope → misma carga, una rep más', () => {
    const s = sugerirProgresion([{ reps: 10, pesoKg: 20 }, { reps: 9, pesoKg: 20 }], plan(8, 12), PRESS);
    expect(s.tipo).toBe('subir-reps');
    expect(s).toMatchObject({ pesoKg: 20, reps: 11 }); // max hecho 10 → 11
  });

  it('no llegó ni al piso → consolidar, no subir', () => {
    const s = sugerirProgresion([{ reps: 6, pesoKg: 20 }, { reps: 5, pesoKg: 20 }], plan(8, 12), PRESS);
    expect(s.tipo).toBe('mantener');
    expect(s).toMatchObject({ pesoKg: 20 });
  });

  it('una sola serie al tope basta para subir (solo cuenta lo registrado)', () => {
    const s = sugerirProgresion([{ reps: 12, pesoKg: 25 }], plan(8, 12), PRESS);
    expect(s.tipo).toBe('subir-peso');
    expect(s).toMatchObject({ pesoKg: 27.5, reps: 8 });
  });

  it('usa el peso de trabajo (el más pesado), ignorando series livianas', () => {
    // calentó con 15 y trabajó con 22,5 al tope → sube sobre 22,5
    const s = sugerirProgresion([{ reps: 12, pesoKg: 15 }, { reps: 12, pesoKg: 22.5 }], plan(10, 12), PRESS);
    expect(s.tipo).toBe('subir-peso');
    expect(s).toMatchObject({ pesoKg: 25 });
  });

  it('sin historial usa el peso inicial de la IA si está', () => {
    expect(sugerirProgresion(null, plan(8, 12, { pesoInicialKg: 30 }), PRESS)).toEqual({ tipo: 'sin-datos', texto: expect.stringContaining('30') });
  });

  it('sin historial ni peso inicial invita a arrancar cómodo', () => {
    expect(sugerirProgresion([], plan(8, 12), PRESS).tipo).toBe('sin-datos');
  });

  it('a peso corporal (sin pesoKg) no sugiere carga', () => {
    expect(sugerirProgresion([{ reps: 12 }, { reps: 12 }], plan(8, 12), PRESS).tipo).toBe('sin-datos');
  });

  it('cardio/elongación no progresan por peso', () => {
    const cardio = ej('C1', 'trote', 'cardio');
    expect(sugerirProgresion([{ reps: 1, pesoKg: 0 }], plan(1, 1), cardio).tipo).toBe('sin-datos');
  });
});
