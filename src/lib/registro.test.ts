// Feature: registro de sesión de un tap (mínima fricción).
import { describe, it, expect } from 'vitest';
import {
  registrarHecha,
  registrarOtra,
  fechaValidaRetro,
  resumenSemanal,
  ejerciciosEsquivados,
  CONFIG_DEFAULT,
} from './registro';
import type { Ejercicio, Rutina, Sesion } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo'], movimiento: string): Ejercicio {
  return {
    id, nombre_es: id, nombre_en: id, tipo, grupo: 'pesas', equipment: 'x',
    zona: 'z', musculo: 'm', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const CAT = [
  ej('F1', 'fuerza', 'empuje-pectorales'),
  ej('F2', 'fuerza', 'traccion-dorsales'),
  ej('C1', 'cardio', 'otro-sistema-cardiovascular'),
];

const RUTINA: Rutina = {
  generadaEl: '2026-07-01',
  seed: 1,
  origen: 'reglas',
  dias: [
    {
      nombre: 'Día 1 — Fuerza',
      enfoque: 'full',
      ejercicios: [
        { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        { movimiento: 'traccion-dorsales', ejercicioId: 'F2', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    },
    {
      nombre: 'Día Cinta — Intervalos',
      enfoque: 'cardio',
      ejercicios: [
        { movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'C1', series: 6, repsMin: 2, repsMax: 2, unidad: 'min', descansoSeg: 180 },
      ],
    },
  ],
};

describe('registrarHecha — un tap', () => {
  it('guarda estado hecha con el nombre del día, sin detalle obligatorio', () => {
    const s = registrarHecha(RUTINA, 0, CAT, '2026-07-12');
    expect(s.estado).toBe('hecha');
    expect(s.diaRutina).toBe('Día 1 — Fuerza');
    expect(s.diaIndex).toBe(0);
    expect(s.tipo).toBe('fuerza');
    expect(s.items).toBeUndefined(); // el detalle fino es opcional
    expect(s.rpe).toBeUndefined();
  });

  it('el RPE es opcional y se agrega si vino', () => {
    const s = registrarHecha(RUTINA, 0, CAT, '2026-07-12', 7);
    expect(s.rpe).toBe(7);
  });

  it('un día de cardio queda tipo cardio (cuenta pero no avanza el ciclo de fuerza)', () => {
    const s = registrarHecha(RUTINA, 1, CAT, '2026-07-12');
    expect(s.tipo).toBe('cardio');
  });
});

describe('registrarOtra — dos taps', () => {
  it('caminata 40 min → sesión válida estado otra', () => {
    const s = registrarOtra('caminata', 40, '2026-07-13');
    expect(s.estado).toBe('otra');
    expect(s.tipo).toBe('cardio');
    expect(s.cardio?.tipo).toBe('caminata');
    expect(s.duracionMin).toBe(40);
  });

  it('fuerza libre no trae diaIndex (no corre el ciclo de la rutina)', () => {
    const s = registrarOtra('fuerza', 30, '2026-07-13');
    expect(s.tipo).toBe('fuerza');
    expect(s.diaIndex).toBeUndefined();
  });

  it('cinta y otro mapean a tipos válidos', () => {
    expect(registrarOtra('cinta', 20, '2026-07-13').cardio?.tipo).toBe('cinta');
    expect(registrarOtra('otro', 25, '2026-07-13').tipo).toBe('otro');
  });
});

describe('fechaValidaRetro — máximo 7 días atrás', () => {
  it('hoy y ayer valen; 7 días atrás vale; 8 no; futuro no', () => {
    expect(fechaValidaRetro('2026-07-12', '2026-07-12')).toBe(true);
    expect(fechaValidaRetro('2026-07-11', '2026-07-12')).toBe(true);
    expect(fechaValidaRetro('2026-07-05', '2026-07-12')).toBe(true);
    expect(fechaValidaRetro('2026-07-04', '2026-07-12')).toBe(false);
    expect(fechaValidaRetro('2026-07-13', '2026-07-12')).toBe(false);
  });
});

describe('resumenSemanal — EL número de la home', () => {
  const sesiones: Sesion[] = [
    { fecha: '2026-07-06', tipo: 'fuerza', estado: 'hecha', diaIndex: 0 }, // lunes
    { fecha: '2026-07-08', tipo: 'cardio', estado: 'otra', duracionMin: 40 },
    { fecha: '2026-07-08', tipo: 'elongacion', estado: 'hecha' }, // mismo día: cuenta 1
    { fecha: '2026-07-05', tipo: 'fuerza', estado: 'hecha' }, // domingo: semana anterior
  ];

  it('cuenta días con actividad de la semana en curso (lunes a domingo)', () => {
    // 2026-07-12 es domingo; semana = lunes 06 al domingo 12
    const r = resumenSemanal(sesiones, '2026-07-12', 3);
    expect(r).toEqual({ hechas: 2, objetivo: 3 });
  });

  it('"hecha" y "otra" cuentan igual — hecha es hecha', () => {
    const soloOtra: Sesion[] = [{ fecha: '2026-07-07', tipo: 'otro', estado: 'otra', duracionMin: 20 }];
    expect(resumenSemanal(soloOtra, '2026-07-12', 3).hechas).toBe(1);
  });

  it('sesiones viejas sin estado cuentan como hechas (retrocompat)', () => {
    const vieja: Sesion[] = [{ fecha: '2026-07-07', tipo: 'fuerza', diaIndex: 0, items: [] }];
    expect(resumenSemanal(vieja, '2026-07-12', 3).hechas).toBe(1);
  });

  it('config default: objetivo 3, umbral de pausa 7', () => {
    expect(CONFIG_DEFAULT).toEqual({ objetivoSemanal: 3, umbralPausaDias: 7, unidadEntrada: 'kg' });
  });
});

describe('ejerciciosEsquivados', () => {
  function sesionCon(items: Sesion['items']): Sesion {
    return { fecha: '2026-07-20', tipo: 'fuerza', estado: 'hecha', items };
  }

  it('cuenta los salteados y ordena por frecuencia', () => {
    const sesiones = [
      sesionCon([{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }]),
      sesionCon([
        { ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true },
        { ejercicioId: 'F2', variante: 'pesas', series: [], salteado: true },
      ]),
      sesionCon([{ ejercicioId: 'F2', variante: 'pesas', series: [], salteado: true }]),
      sesionCon([{ ejercicioId: 'F2', variante: 'pesas', series: [], salteado: true }]),
    ];
    expect(ejerciciosEsquivados(sesiones)).toEqual([
      { ejercicioId: 'F2', veces: 3 },
      { ejercicioId: 'F1', veces: 2 },
    ]);
  });

  it('ignora los que hiciste y los que salteaste una sola vez', () => {
    const sesiones = [
      sesionCon([{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10 }] }]),
      sesionCon([{ ejercicioId: 'F3', variante: 'pesas', series: [], salteado: true }]),
    ];
    expect(ejerciciosEsquivados(sesiones)).toEqual([]);
  });

  it('tolera sesiones sin items', () => {
    expect(ejerciciosEsquivados([{ fecha: '2026-07-20', tipo: 'fuerza' }])).toEqual([]);
  });
});
