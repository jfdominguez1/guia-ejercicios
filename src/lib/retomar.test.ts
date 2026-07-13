// Feature: botón "Retomar" (anti-abandono) — pausa detectada + vuelta reducida.
import { describe, it, expect } from 'vitest';
import {
  detectarPausa,
  detectarPausas,
  reducirDia,
  reducirRutina,
  pesoSugeridoRetomar,
  resolverRetomar,
} from './retomar';
import { CONFIG_DEFAULT } from './registro';
import type { DiaRutina, Ejercicio, Rutina, Sesion } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo'], movimiento: string): Ejercicio {
  return {
    id, nombre_es: id, nombre_en: id, tipo, grupo: 'pesas', equipment: 'x',
    zona: 'z', musculo: 'm', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const CAT = [
  ej('F1', 'fuerza', 'empuje-pectorales'),
  ej('C1', 'cardio', 'otro-sistema-cardiovascular'),
  ej('E1', 'elongacion', 'elongacion-isquiotibiales'),
];

const DIA_MIXTO: DiaRutina = {
  nombre: 'Día 1',
  enfoque: 'mixto',
  ejercicios: [
    { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
    { movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'C1', series: 6, repsMin: 2, repsMax: 2, unidad: 'min', descansoSeg: 180 },
    { movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'C1', series: 1, repsMin: 30, repsMax: 30, unidad: 'min', descansoSeg: 0 },
    { movimiento: 'elongacion-isquiotibiales', ejercicioId: 'E1', series: 1, repsMin: 30, repsMax: 30, descansoSeg: 10 },
  ],
};

const RUTINA: Rutina = { generadaEl: '2026-06-01', seed: 1, origen: 'reglas', dias: [DIA_MIXTO] };

function sesion(fecha: string): Sesion {
  return { fecha, tipo: 'fuerza', estado: 'hecha', diaIndex: 0 };
}

describe('detectarPausa', () => {
  it('menos del umbral → sin pausa', () => {
    const r = detectarPausa([sesion('2026-07-08')], '2026-07-12', 7);
    expect(r.enPausa).toBe(false);
    expect(r.nivel).toBe('ninguna');
  });

  it('7-14 días → corta; 14-30 → media; +30 → larga', () => {
    expect(detectarPausa([sesion('2026-07-02')], '2026-07-12', 7).nivel).toBe('corta'); // 10 días
    expect(detectarPausa([sesion('2026-06-22')], '2026-07-12', 7).nivel).toBe('media'); // 20 días
    expect(detectarPausa([sesion('2026-06-01')], '2026-07-12', 7).nivel).toBe('larga'); // 41 días
  });

  it('el umbral es configurable', () => {
    const r = detectarPausa([sesion('2026-07-07')], '2026-07-12', 4); // 5 días, umbral 4
    expect(r.enPausa).toBe(true);
  });

  it('sin sesiones nunca → no es pausa (es empezar, no retomar)', () => {
    expect(detectarPausa([], '2026-07-12', 7).enPausa).toBe(false);
  });

  it('cualquier tipo de sesión corta la pausa (elongación también)', () => {
    const sesiones: Sesion[] = [
      sesion('2026-06-20'),
      { fecha: '2026-07-10', tipo: 'elongacion', estado: 'hecha' },
    ];
    expect(detectarPausa(sesiones, '2026-07-12', 7).enPausa).toBe(false);
  });
});

describe('detectarPausas — histórico para el export', () => {
  it('encuentra los huecos >= umbral entre sesiones', () => {
    const sesiones = [sesion('2026-05-01'), sesion('2026-05-20'), sesion('2026-05-22')];
    const pausas = detectarPausas(sesiones, 7);
    expect(pausas).toHaveLength(1);
    expect(pausas[0]).toEqual({ desde: '2026-05-01', hasta: '2026-05-20', dias: 19 });
  });
});

describe('reducirDia — versión corta', () => {
  const reducido = reducirDia(DIA_MIXTO, CAT);

  it('fuerza: 2 series en vez de 3', () => {
    expect(reducido.ejercicios[0]?.series).toBe(2);
  });

  it('cardio por bloques: 60% de los bloques (6 → 4); continuo: 60% del tiempo (30 → 18 min)', () => {
    expect(reducido.ejercicios[1]?.series).toBe(4);
    expect(reducido.ejercicios[1]?.repsMin).toBe(2); // los minutos del bloque no cambian
    expect(reducido.ejercicios[2]?.repsMin).toBe(18);
    expect(reducido.ejercicios[2]?.repsMax).toBe(18);
  });

  it('elongación queda igual', () => {
    expect(reducido.ejercicios[3]).toEqual(DIA_MIXTO.ejercicios[3]);
  });

  it('no muta el día original y no lo marca como light', () => {
    expect(DIA_MIXTO.ejercicios[0]?.series).toBe(3);
    expect(reducido.nombre).toBe(DIA_MIXTO.nombre); // sin asterisco: hecha es hecha
  });
});

describe('pesoSugeridoRetomar — 20% menos que la última vez', () => {
  const sesiones: Sesion[] = [
    {
      fecha: '2026-06-01',
      tipo: 'fuerza',
      diaIndex: 0,
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 22 }] }],
    },
  ];

  it('devuelve el último peso -20% redondeado a 0.5', () => {
    expect(pesoSugeridoRetomar(sesiones, 'F1', 'pesas')).toBe(17.5); // 22*0.8=17.6
  });

  it('sin registro de peso → null (solo se reducen series)', () => {
    expect(pesoSugeridoRetomar(sesiones, 'F1', 'maquina')).toBeNull();
    expect(pesoSugeridoRetomar([], 'F1', 'pesas')).toBeNull();
  });
});

describe('resolverRetomar — escalado por duración de pausa', () => {
  it('sin pausa → modo normal', () => {
    const r = resolverRetomar(RUTINA, [sesion('2026-07-10')], '2026-07-12', CONFIG_DEFAULT, CAT);
    expect(r.modo).toBe('normal');
  });

  it('pausa corta (7-14) → una sesión reducida y vuelve a la rutina normal', () => {
    const r = resolverRetomar(RUTINA, [sesion('2026-07-02')], '2026-07-12', CONFIG_DEFAULT, CAT);
    expect(r.modo).toBe('retomar');
    expect(r.nivel).toBe('corta');
    expect(r.sesionReducida?.ejercicios[0]?.series).toBe(2);
    expect(r.semanaReducida).toBe(false);
    expect(r.sugerirIA).toBe(false);
    expect(r.mensaje).toBeTruthy();
  });

  it('pausa media (14-30) → primera semana entera reducida', () => {
    const r = resolverRetomar(RUTINA, [sesion('2026-06-22')], '2026-07-12', CONFIG_DEFAULT, CAT);
    expect(r.nivel).toBe('media');
    expect(r.semanaReducida).toBe(true);
  });

  it('pausa larga (+30) → sugerir regenerar con la IA', () => {
    const r = resolverRetomar(RUTINA, [sesion('2026-06-01')], '2026-07-12', CONFIG_DEFAULT, CAT);
    expect(r.nivel).toBe('larga');
    expect(r.sugerirIA).toBe(true);
  });

  it('el mensaje nunca menciona los días perdidos (regla: cero culpa)', () => {
    const r = resolverRetomar(RUTINA, [sesion('2026-07-02')], '2026-07-12', CONFIG_DEFAULT, CAT);
    expect(r.mensaje).not.toMatch(/\d+ días/);
    expect(r.mensaje?.toLowerCase()).not.toContain('no entren');
  });
});

describe('reducirRutina', () => {
  it('reduce todos los días sin mutar la original', () => {
    const reducida = reducirRutina(RUTINA, CAT);
    expect(reducida.dias[0]?.ejercicios[0]?.series).toBe(2);
    expect(RUTINA.dias[0]?.ejercicios[0]?.series).toBe(3);
  });
});
