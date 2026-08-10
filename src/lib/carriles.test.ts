// Feature: carriles por tipo — rotación propia por carril y meta 2·2·3.
// Los casos están armados con la rutina v9 y el historial reales de JFD.
import { describe, it, expect } from 'vitest';
import {
  carrilDelDia,
  deuda,
  estadoCarriles,
  metasDe,
  proximoDelCarril,
  resumenSemana,
  sesionCuenta,
  textoUltimaVez,
  META_DEFAULT,
} from './carriles';
import { CONFIG_DEFAULT } from './registro';
import type { Config, DiaRutina, Ejercicio, Rutina, Sesion } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo']): Ejercicio {
  return {
    id, nombre_es: id, nombre_en: id, tipo, grupo: 'cuerpo', equipment: 'x', zona: 'z',
    musculo: 'm', secundarios: [], pasos: [], movimiento: 'mov', basico: false,
  };
}

const CATALOGO = [
  ej('F1', 'fuerza'), ej('F2', 'fuerza'),
  ej('CARDIO-bici-z2', 'cardio'), ej('CARDIO-cinta-pendiente', 'cardio'),
  ej('ST-A', 'elongacion'), ej('ST-B', 'elongacion'),
];

const paso = (ejercicioId: string) =>
  ({ movimiento: 'mov', ejercicioId, series: 2, repsMin: 10, repsMax: 12, descansoSeg: 60 });

/** La rutina v9 real: 2 días de fuerza, 2 de cardio (con cola de elongación), 1 de elongación. */
const RUTINA: Rutina = {
  generadaEl: '2026-08-01',
  seed: 1,
  origen: 'ia',
  dias: [
    { nombre: 'Día 1 — Fuerza A', enfoque: 'x', ejercicios: [paso('F1'), paso('F2')] },
    { nombre: 'Día 2 — Zona 2 sostenida', enfoque: 'x', ejercicios: [paso('CARDIO-cinta-pendiente'), paso('ST-A'), paso('ST-B')] },
    { nombre: 'Día 3 — Fuerza B', enfoque: 'x', ejercicios: [paso('F2'), paso('F1')] },
    { nombre: 'Día 4 — Bici: zona 2', enfoque: 'x', ejercicios: [paso('CARDIO-bici-z2'), paso('ST-A')] },
    { nombre: 'Elongación (mañanas)', enfoque: 'x', ejercicios: [paso('ST-A'), paso('ST-B')] },
  ],
};

function sesion(fecha: string, tipo: Sesion['tipo'], diaIndex?: number, extra: Partial<Sesion> = {}): Sesion {
  return { fecha, tipo, estado: 'hecha', ...(diaIndex === undefined ? {} : { diaIndex }), ...extra };
}

const HOY = '2026-08-09'; // domingo
const CONFIG: Config = { ...CONFIG_DEFAULT };
const del = (estados: ReturnType<typeof estadoCarriles>, c: string) =>
  estados.find((e) => e.carril === c)!;

describe('carrilDelDia', () => {
  it('un día de fuerza es del carril fuerza', () => {
    expect(carrilDelDia(RUTINA.dias[0]!, CATALOGO)).toBe('fuerza');
  });

  // La clave: un día de 45 min de cinta con 4 estiramientos de cola es CARDIO.
  // Con "el tipo más frecuente" habría dado elongación, que es el error que la
  // IA de JFD pidió y que habría empeorado el caso.
  it('un día de cardio con cola de elongaciones es del carril cardio', () => {
    expect(carrilDelDia(RUTINA.dias[1]!, CATALOGO)).toBe('cardio');
    expect(carrilDelDia(RUTINA.dias[3]!, CATALOGO)).toBe('cardio');
  });

  it('un día de solo elongación es del carril elongación', () => {
    expect(carrilDelDia(RUTINA.dias[4]!, CATALOGO)).toBe('elongacion');
  });

  it('un día vacío no rompe', () => {
    const vacio: DiaRutina = { nombre: 'x', enfoque: '', ejercicios: [] };
    expect(carrilDelDia(vacio, CATALOGO)).toBe('elongacion');
  });
});

describe('sesionCuenta', () => {
  it('una sesión con algo hecho cuenta', () => {
    expect(sesionCuenta(sesion('2026-08-09', 'fuerza', 0, {
      items: [{ ejercicioId: 'F1', variante: 'cuerpo', series: [{ reps: 10 }] }],
    }))).toBe(true);
  });

  // El 08/08 quedó registrada una sesión de elongación con los 4 estiramientos
  // salteados: pintar ese casillero de verde sería mentir.
  it('una sesión con TODO salteado no cuenta', () => {
    expect(sesionCuenta(sesion('2026-08-08', 'elongacion', 1, {
      items: [
        { ejercicioId: 'ST-A', variante: 'cuerpo', series: [], salteado: true },
        { ejercicioId: 'ST-B', variante: 'cuerpo', series: [], salteado: true },
      ],
    }))).toBe(false);
  });

  it('con uno solo hecho ya cuenta: no se exige perfección', () => {
    expect(sesionCuenta(sesion('2026-08-08', 'elongacion', 1, {
      items: [
        { ejercicioId: 'ST-A', variante: 'cuerpo', series: [{ reps: 30 }] },
        { ejercicioId: 'ST-B', variante: 'cuerpo', series: [], salteado: true },
      ],
    }))).toBe(true);
  });

  it('"Hecha ✓" y los registros rápidos cuentan aunque no traigan detalle', () => {
    expect(sesionCuenta(sesion('2026-08-09', 'cardio'))).toBe(true);
  });
});

describe('la rotación avanza por carril — EL BUG', () => {
  const DIAS_FUERZA = [
    { diaIndex: 0, nombre: 'Día 1 — Fuerza A' },
    { diaIndex: 2, nombre: 'Día 3 — Fuerza B' },
  ];
  const DIAS_CARDIO = [
    { diaIndex: 1, nombre: 'Día 2 — Zona 2 sostenida' },
    { diaIndex: 3, nombre: 'Día 4 — Bici: zona 2' },
  ];

  it('sin historial arranca por el primero de cada carril', () => {
    expect(proximoDelCarril(DIAS_FUERZA, [], 'fuerza')?.diaIndex).toBe(0);
    expect(proximoDelCarril(DIAS_CARDIO, [], 'cardio')?.diaIndex).toBe(1);
  });

  it('hacer fuerza avanza SOLO el carril de fuerza', () => {
    const s = [sesion('2026-08-08', 'fuerza', 0)];
    expect(proximoDelCarril(DIAS_FUERZA, s, 'fuerza')?.diaIndex).toBe(2);
    // Y el cardio se queda donde estaba, que es lo correcto.
    expect(proximoDelCarril(DIAS_CARDIO, s, 'cardio')?.diaIndex).toBe(1);
  });

  // ACÁ ESTABA EL BUG: con la rotación global, hacer cardio no movía nada
  // porque resolverSalteo solo miraba sesiones de tipo 'fuerza'. JFD hizo
  // zona 2 el 06/08 y la app le volvió a proponer el mismo día el 08 y el 09.
  it('hacer cardio avanza el carril de cardio (antes no avanzaba nada)', () => {
    const s = [sesion('2026-08-06', 'cardio', 1)];
    expect(proximoDelCarril(DIAS_CARDIO, s, 'cardio')?.diaIndex).toBe(3);
  });

  it('tres cardios seguidos rotan de verdad, no repiten el mismo día', () => {
    const s = [
      sesion('2026-08-05', 'cardio', 1),
      sesion('2026-08-06', 'cardio', 3),
      sesion('2026-08-07', 'cardio', 1),
    ];
    expect(proximoDelCarril(DIAS_CARDIO, s, 'cardio')?.diaIndex).toBe(3);
  });

  it('da la vuelta al llegar al final', () => {
    const s = [sesion('2026-08-08', 'fuerza', 2)];
    expect(proximoDelCarril(DIAS_FUERZA, s, 'fuerza')?.diaIndex).toBe(0);
  });

  it('una sesión que no cuenta no mueve la rotación', () => {
    const salteada = sesion('2026-08-08', 'fuerza', 0, {
      items: [{ ejercicioId: 'F1', variante: 'cuerpo', series: [], salteado: true }],
    });
    expect(proximoDelCarril(DIAS_FUERZA, [salteada], 'fuerza')?.diaIndex).toBe(0);
  });

  it('si el último día ya no está en la rutina, arranca de nuevo sin romper', () => {
    const s = [sesion('2026-08-08', 'fuerza', 99)];
    expect(proximoDelCarril(DIAS_FUERZA, s, 'fuerza')?.diaIndex).toBe(0);
  });

  it('un carril sin días en la rutina no propone nada', () => {
    expect(proximoDelCarril([], [], 'elongacion')).toBeUndefined();
  });
});

describe('estadoCarriles', () => {
  it('reparte los días de la rutina en sus carriles', () => {
    const e = estadoCarriles(RUTINA, [], CATALOGO, HOY, CONFIG);
    expect(del(e, 'fuerza').dias.map((d) => d.diaIndex)).toEqual([0, 2]);
    expect(del(e, 'cardio').dias.map((d) => d.diaIndex)).toEqual([1, 3]);
    expect(del(e, 'elongacion').dias.map((d) => d.diaIndex)).toEqual([4]);
  });

  it('cuenta las sesiones de la semana por tipo, no los días', () => {
    // Semana del 03/08. El 09 hace cardio Y elongación: son DOS casilleros el
    // mismo día — es exactamente lo que JFD pidió poder hacer.
    const s = [
      sesion('2026-08-03', 'fuerza', 0), sesion('2026-08-08', 'fuerza', 2),
      sesion('2026-08-06', 'cardio', 1), sesion('2026-08-09', 'cardio', 3),
      sesion('2026-08-09', 'elongacion', 4),
    ];
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG);
    expect(del(e, 'fuerza').hechas).toBe(2);
    expect(del(e, 'cardio').hechas).toBe(2);
    expect(del(e, 'elongacion').hechas).toBe(1);
  });

  it('no cuenta las sesiones de la semana pasada', () => {
    const e = estadoCarriles(RUTINA, [sesion('2026-08-02', 'fuerza', 0)], CATALOGO, HOY, CONFIG);
    expect(del(e, 'fuerza').hechas).toBe(0);
  });

  // Elongación va en 3: con tres días rotando, el más difícil (cadera y
  // piernas) toca una de cada tres veces y no una de cada dos.
  it('la meta por defecto es 2 · 2 · 3', () => {
    const e = estadoCarriles(RUTINA, [], CATALOGO, HOY, CONFIG);
    expect(del(e, 'fuerza').meta).toBe(2);
    expect(del(e, 'cardio').meta).toBe(2);
    expect(del(e, 'elongacion').meta).toBe(3);
    expect(META_DEFAULT).toEqual({ fuerza: 2, cardio: 2, elongacion: 3 });
  });

  it('el más atrasado va arriba', () => {
    // Fuerza y cardio cumplidos, elongación en cero: tiene que encabezar.
    const s = [
      sesion('2026-08-03', 'fuerza', 0), sesion('2026-08-05', 'fuerza', 2),
      sesion('2026-08-06', 'cardio', 1), sesion('2026-08-07', 'cardio', 3),
    ];
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG);
    expect(e[0]!.carril).toBe('elongacion');
    expect(deuda(e[0]!)).toBe(3);
  });

  // La deuda manda SOBRE el hace-cuánto. Hace falta un caso donde apunten a
  // carriles distintos: si no, el orden pasa igual con la regla equivocada.
  it('la deuda pesa más que el hace-cuánto', () => {
    const config: Config = { ...CONFIG, metaSemanal: { fuerza: 3, cardio: 2, elongacion: 2 } };
    const s = [
      sesion('2026-08-09', 'fuerza', 0), // hoy → debe 2, hace 0 días
      sesion('2026-08-04', 'cardio', 1), // → debe 1, hace 5 días
      sesion('2026-08-05', 'elongacion', 4),
      sesion('2026-08-06', 'elongacion', 4), // → debe 0, hace 3 días
    ];
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, config);
    // Por hace-cuánto solo sería cardio · elongación · fuerza. Manda la deuda.
    expect(e.map((x) => x.carril)).toEqual(['fuerza', 'cardio', 'elongacion']);
  });

  it('a igual deuda, primero el que hace más que no hacés', () => {
    const s = [sesion('2026-08-03', 'fuerza', 0), sesion('2026-08-08', 'cardio', 1)];
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG);
    // Los tres deben 1, 1 y 2 → elongación primero (nunca hecha).
    expect(e[0]!.carril).toBe('elongacion');
    // Entre fuerza (hace 6 días) y cardio (hace 1), va fuerza.
    expect(e[1]!.carril).toBe('fuerza');
  });

  it('un carril sin días en la rutina queda último aunque deba todo', () => {
    const sinElongacion: Rutina = { ...RUTINA, dias: RUTINA.dias.slice(0, 4) };
    const e = estadoCarriles(sinElongacion, [], CATALOGO, HOY, CONFIG);
    expect(e[e.length - 1]!.carril).toBe('elongacion');
    expect(e[e.length - 1]!.proximo).toBeUndefined();
  });

  it('sin rutina no rompe: devuelve los tres carriles vacíos', () => {
    const e = estadoCarriles(null, [], CATALOGO, HOY, CONFIG);
    expect(e).toHaveLength(3);
    expect(e.every((x) => x.dias.length === 0)).toBe(true);
  });

  it('respeta una meta configurada distinta de la de fábrica', () => {
    const config: Config = { ...CONFIG, metaSemanal: { fuerza: 3, cardio: 1, elongacion: 2 } };
    expect(metasDe(config).fuerza).toBe(3);
    expect(del(estadoCarriles(RUTINA, [], CATALOGO, HOY, config), 'cardio').meta).toBe(1);
  });

  it('una config vieja sin metaSemanal usa la de fábrica', () => {
    expect(metasDe({ objetivoSemanal: 3, umbralPausaDias: 7 })).toEqual(META_DEFAULT);
  });
});

describe('textos', () => {
  const base = { carril: 'fuerza' as const, dias: [], hechas: 0, meta: 2 };

  it('dice hace cuánto sin números crudos', () => {
    expect(textoUltimaVez({ ...base })).toBe('todavía no');
    expect(textoUltimaVez({ ...base, diasDesde: 0 })).toBe('hoy');
    expect(textoUltimaVez({ ...base, diasDesde: 1 })).toBe('ayer');
    expect(textoUltimaVez({ ...base, diasDesde: 5 })).toBe('hace 5 días');
  });

  it('nombra lo que falta sin reprochar nada', () => {
    const s = [
      sesion('2026-08-03', 'fuerza', 0), sesion('2026-08-05', 'fuerza', 2),
      sesion('2026-08-06', 'cardio', 1),
    ];
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG);
    const texto = resumenSemana(e);
    expect(texto).toContain('3 de elongación');
    expect(texto).toContain('1 de cardio');
    expect(texto).not.toContain('no hiciste');
  });

  it('la semana completa se celebra', () => {
    const s = [
      sesion('2026-08-03', 'fuerza', 0), sesion('2026-08-05', 'fuerza', 2),
      sesion('2026-08-04', 'cardio', 1), sesion('2026-08-06', 'cardio', 3),
      sesion('2026-08-07', 'elongacion', 4), sesion('2026-08-08', 'elongacion', 4),
      sesion('2026-08-09', 'elongacion', 4),
    ];
    expect(resumenSemana(estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG))).toContain('completa');
  });

  it('pasarse de la meta no genera crédito ni deuda negativa', () => {
    const s = Array.from({ length: 5 }, (_, i) => sesion(`2026-08-0${3 + i}`, 'fuerza', 0));
    const e = estadoCarriles(RUTINA, s, CATALOGO, HOY, CONFIG);
    expect(deuda(del(e, 'fuerza'))).toBe(0);
    expect(del(e, 'fuerza').hechas).toBe(5);
  });
});
