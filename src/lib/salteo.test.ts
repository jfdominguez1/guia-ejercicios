import { describe, it, expect } from 'vitest';
import { resolverSalteo, ultimaVez, ultimaVezMovimiento, variantesDe, regenerar } from './motor';
import { generarRutina } from './motor';
import type { Ejercicio, Perfil, Rutina, Sesion } from './tipos';

function ej(id: string, grupo: Ejercicio['grupo'], movimiento: string): Ejercicio {
  return {
    id,
    nombre_es: id,
    nombre_en: id,
    tipo: 'fuerza',
    grupo,
    equipment: grupo,
    zona: 'z',
    musculo: movimiento.split('-').slice(-1)[0] ?? '',
    secundarios: [],
    pasos: [],
    movimiento,
    basico: true,
  };
}

const CAT: Ejercicio[] = [
  ej('P1', 'pesas', 'empuje-pectorales'),
  ej('M1', 'maquina', 'empuje-pectorales'),
  ej('B1', 'banda', 'empuje-pectorales'),
  ej('C1', 'cuerpo', 'empuje-pectorales'),
  ej('P2', 'pesas', 'traccion-dorsales'),
  ej('M2', 'maquina', 'traccion-dorsales'),
  ej('P3', 'pesas', 'piernas-empuje-cuadriceps'),
  ej('P4', 'pesas', 'cadera-gluteos'),
  ej('P5', 'pesas', 'curl-biceps'),
  ej('P6', 'pesas', 'elevacion-deltoides'),
  ej('P7', 'pesas', 'core-abdominales'),
  ej('P8', 'pesas', 'empuje-deltoides'),
  ej('P9', 'pesas', 'extension-triceps'),
];

// Rutina de 3 días (gap esperado ≈ 2 días)
const RUTINA: Rutina = {
  generadaEl: '2026-07-01',
  seed: 1,
  origen: 'reglas',
  dias: [
    {
      nombre: 'Día 1',
      enfoque: 'a',
      ejercicios: [
        { movimiento: 'empuje-pectorales', ejercicioId: 'P1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        { movimiento: 'curl-biceps', ejercicioId: 'P5', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    },
    {
      nombre: 'Día 2',
      enfoque: 'b',
      ejercicios: [
        { movimiento: 'traccion-dorsales', ejercicioId: 'P2', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        { movimiento: 'elevacion-deltoides', ejercicioId: 'P6', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    },
    {
      nombre: 'Día 3',
      enfoque: 'c',
      ejercicios: [
        { movimiento: 'piernas-empuje-cuadriceps', ejercicioId: 'P3', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        { movimiento: 'cadera-gluteos', ejercicioId: 'P4', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    },
  ],
};

function sesionFuerza(fecha: string, diaIndex: number): Sesion {
  return { fecha, tipo: 'fuerza', diaIndex, items: [] };
}

describe('resolverSalteo', () => {
  it('sin sesiones previas → normal, arranca por el día 0', () => {
    const r = resolverSalteo(RUTINA, [], '2026-07-10');
    expect(r.tipo).toBe('normal');
    expect(r.diaIndex).toBe(0);
  });

  it('al día siguiente del último → normal, día siguiente', () => {
    const r = resolverSalteo(RUTINA, [sesionFuerza('2026-07-08', 0)], '2026-07-10');
    expect(r.tipo).toBe('normal');
    expect(r.diaIndex).toBe(1);
  });

  it('1 día salteado → pendiente (la semana se corre)', () => {
    const r = resolverSalteo(RUTINA, [sesionFuerza('2026-07-06', 0)], '2026-07-10');
    expect(r.tipo).toBe('pendiente');
    expect(r.diaIndex).toBe(1);
    expect(r.mensaje).toBeTruthy();
  });

  it('2+ salteados → combinada con hasta 4 compuestos de los días perdidos', () => {
    const r = resolverSalteo(RUTINA, [sesionFuerza('2026-07-04', 0)], '2026-07-10');
    expect(r.tipo).toBe('combinada');
    expect(r.ejercicios).toBeDefined();
    expect(r.ejercicios!.length).toBeGreaterThan(0);
    expect(r.ejercicios!.length).toBeLessThanOrEqual(4);
    // solo compuestos (empuje/traccion/piernas/cadera)
    for (const e of r.ejercicios!) {
      expect(/^(empuje|traccion|piernas-empuje|cadera)-/.test(e.movimiento)).toBe(true);
    }
  });

  it('más de 7 días sin entrenar → reset a semana normal', () => {
    const r = resolverSalteo(RUTINA, [sesionFuerza('2026-07-01', 2)], '2026-07-10');
    expect(r.tipo).toBe('reset');
    expect(r.diaIndex).toBe(0);
  });

  it('cardio y elongación no cuentan como día de fuerza para el ciclo', () => {
    const sesiones: Sesion[] = [
      sesionFuerza('2026-07-08', 0),
      { fecha: '2026-07-09', tipo: 'cardio', cardio: { tipo: 'corrida', minutos: 30 } },
    ];
    const r = resolverSalteo(RUTINA, sesiones, '2026-07-10');
    expect(r.diaIndex).toBe(1); // sigue después del día 0 de fuerza
  });
});

describe('ultimaVez', () => {
  const sesiones: Sesion[] = [
    {
      fecha: '2026-07-01',
      tipo: 'fuerza',
      diaIndex: 0,
      items: [{ ejercicioId: 'P1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }],
    },
    {
      fecha: '2026-07-05',
      tipo: 'fuerza',
      diaIndex: 0,
      items: [
        { ejercicioId: 'P1', variante: 'pesas', series: [{ reps: 10, pesoKg: 22 }] },
        { ejercicioId: 'M1', variante: 'maquina', series: [{ reps: 12, pesoKg: 35 }] },
      ],
    },
  ];

  it('devuelve la última sesión de ESA variante', () => {
    const r = ultimaVez(sesiones, 'P1', 'pesas');
    expect(r?.fecha).toBe('2026-07-05');
    expect(r?.series[0]?.pesoKg).toBe(22);
  });

  it('incluye el RPE de esa sesión si se registró (A6)', () => {
    const conRpe: Sesion[] = [
      { ...sesiones[1]!, rpe: 7 },
    ];
    expect(ultimaVez(conRpe, 'P1', 'pesas')?.rpe).toBe(7);
    expect(ultimaVez(sesiones, 'P1', 'pesas')?.rpe).toBeUndefined();
  });

  it('variante pesas no devuelve registro de maquina', () => {
    expect(ultimaVez(sesiones, 'P1', 'maquina')).toBeNull();
    expect(ultimaVez(sesiones, 'ZZZ', 'pesas')).toBeNull();
  });

  it('por movimiento: encuentra la variante aunque sea otro ejercicio del mismo movimiento', () => {
    const r = ultimaVezMovimiento(sesiones, 'empuje-pectorales', 'maquina', CAT);
    expect(r?.fecha).toBe('2026-07-05');
    expect(r?.series[0]?.pesoKg).toBe(35);
  });
});

describe('variantesDe', () => {
  it('devuelve las 6 llaves con arrays (vacíos si no hay)', () => {
    const v = variantesDe(CAT, 'empuje-pectorales');
    expect(Object.keys(v).sort()).toEqual(
      ['banda', 'cuerpo', 'maquina', 'pelota', 'pesas', 'rodillo'].sort(),
    );
    expect(v.pesas.map((e) => e.id)).toEqual(['P1']);
    expect(v.maquina.map((e) => e.id)).toEqual(['M1']);
    expect(v.pelota).toEqual([]);
  });
});

describe('regenerar', () => {
  const perfil: Perfil = {
    edad: 30,
    dias: 3,
    nivel: 'entrenado',
    objetivo: 'musculo',
    equipamiento: ['pesas', 'maquina'],
  };

  it('nuevo seed, misma estructura de días', () => {
    const original = generarRutina(perfil, CAT, 10);
    const nueva = regenerar(original, CAT, perfil);
    expect(nueva.seed).not.toBe(original.seed);
    expect(nueva.dias).toHaveLength(original.dias.length);
    expect(nueva.origen).toBe('reglas');
    // determinístico: regenerar dos veces desde la misma rutina da lo mismo
    expect(regenerar(original, CAT, perfil)).toEqual(nueva);
  });
});
