// Motor de reglas: genera la rutina semanal a partir del perfil.
// Funciones puras y determinísticas (PRNG con seed) — sin DOM ni localStorage.

import type {
  DiaRutina,
  Ejercicio,
  EjercicioRutina,
  GrupoEquip,
  Objetivo,
  Perfil,
  Rutina,
  SerieHecha,
  Sesion,
} from './tipos';

const EDAD_MADURA = 40;
const EDAD_MAYOR = 55;
const MIN_EJERCICIOS_DIA = 4;

/** PRNG determinístico (mulberry32). */
export function crearRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Un slot es una lista de prefijos de `movimiento` a probar en orden.
type Slot = string[];
interface PlantillaDia {
  nombre: string;
  enfoque: string;
  slots: Slot[];
}

const FULL_BODY_SLOTS: Slot[] = [
  ['piernas-empuje-'],
  ['empuje-pectorales'],
  ['traccion-dorsales', 'traccion-'],
  ['cadera-'],
  ['empuje-deltoides'],
  ['core-', 'elevacion-abdominales'],
];

const EXTRA_ENFASIS: Record<string, Slot> = {
  empuje: ['elevacion-pectorales', 'empuje-'],
  traccion: ['traccion-espalda-alta', 'traccion-'],
  piernas: ['extension-cuadriceps', 'piernas-empuje-', 'cadera-'],
};

function fullBody(nombre: string): PlantillaDia {
  return { nombre, enfoque: 'cuerpo completo', slots: FULL_BODY_SLOTS };
}

function fullBodyEnfasis(nombre: string, patron: keyof typeof EXTRA_ENFASIS): PlantillaDia {
  const base = FULL_BODY_SLOTS.filter((s) => !s[0]!.startsWith('core-'));
  const conEnfasisPrimero = [...base].sort(
    (a, b) => Number(b[0]!.startsWith(patron)) - Number(a[0]!.startsWith(patron)),
  );
  return {
    nombre,
    enfoque: `cuerpo completo, énfasis ${patron === 'traccion' ? 'tracción' : patron}`,
    slots: [EXTRA_ENFASIS[patron]!, ...conEnfasisPrimero],
  };
}

const SUPERIOR: Slot[] = [
  ['empuje-pectorales'],
  ['traccion-dorsales', 'traccion-'],
  ['empuje-deltoides'],
  ['traccion-espalda-alta', 'traccion-'],
  ['curl-biceps'],
  ['extension-triceps'],
];
const INFERIOR: Slot[] = [
  ['piernas-empuje-'],
  ['cadera-'],
  ['extension-cuadriceps'],
  ['curl-isquiotibiales'],
  ['elevacion-pantorrillas'],
  ['core-'],
];
const PUSH: Slot[] = [
  ['empuje-pectorales'],
  ['empuje-deltoides'],
  ['elevacion-pectorales'],
  ['elevacion-deltoides'],
  ['extension-triceps'],
  ['core-'],
];
const PULL: Slot[] = [
  ['traccion-dorsales'],
  ['traccion-espalda-alta', 'traccion-'],
  ['elevacion-deltoides'],
  ['curl-biceps'],
  ['otro-trapecios', 'traccion-'],
  ['core-'],
];

function dia(nombre: string, enfoque: string, slots: Slot[]): PlantillaDia {
  return { nombre, enfoque, slots };
}

/** Regla 1 del design doc: frecuencia → split. */
function splitPara(dias: number): PlantillaDia[] {
  switch (Math.min(Math.max(dias, 1), 6)) {
    case 1:
      return [fullBody('Día 1 — Full body')];
    case 2:
      return [fullBody('Día 1 — Full body'), fullBody('Día 2 — Full body')];
    case 3:
      return [
        fullBodyEnfasis('Día 1 — Énfasis empuje', 'empuje'),
        fullBodyEnfasis('Día 2 — Énfasis tracción', 'traccion'),
        fullBodyEnfasis('Día 3 — Énfasis piernas', 'piernas'),
      ];
    case 4:
      return [
        dia('Día 1 — Superior', 'pecho, espalda, hombros y brazos', SUPERIOR),
        dia('Día 2 — Inferior', 'piernas, glúteos y core', INFERIOR),
        dia('Día 3 — Superior', 'pecho, espalda, hombros y brazos', SUPERIOR),
        dia('Día 4 — Inferior', 'piernas, glúteos y core', INFERIOR),
      ];
    case 5:
      return [
        dia('Día 1 — Empuje', 'pecho, hombros y tríceps', PUSH),
        dia('Día 2 — Tracción', 'espalda, bíceps y trapecios', PULL),
        dia('Día 3 — Piernas', 'piernas, glúteos y core', INFERIOR),
        dia('Día 4 — Superior', 'pecho, espalda, hombros y brazos', SUPERIOR),
        dia('Día 5 — Inferior', 'piernas, glúteos y core', INFERIOR),
      ];
    default:
      return [
        dia('Día 1 — Empuje', 'pecho, hombros y tríceps', PUSH),
        dia('Día 2 — Tracción', 'espalda, bíceps y trapecios', PULL),
        dia('Día 3 — Piernas', 'piernas, glúteos y core', INFERIOR),
        dia('Día 4 — Empuje', 'pecho, hombros y tríceps', PUSH),
        dia('Día 5 — Tracción', 'espalda, bíceps y trapecios', PULL),
        dia('Día 6 — Piernas', 'piernas, glúteos y core', INFERIOR),
      ];
  }
}

/** Reglas 2 y 3: series/reps/descanso por objetivo, moduladas por edad. */
function dosis(objetivo: Objetivo, edad: number): Omit<EjercicioRutina, 'movimiento' | 'ejercicioId'> {
  const base = {
    fuerza: { series: 4, repsMin: 5, repsMax: 6, descansoSeg: 150 },
    musculo: { series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
    tono: { series: 3, repsMin: 12, repsMax: 15, descansoSeg: 60 },
  }[objetivo];
  const pisoReps = edad >= EDAD_MAYOR ? 12 : edad >= EDAD_MADURA ? 8 : 0;
  const repsMin = Math.max(base.repsMin, pisoReps);
  const repsMax =
    repsMin > base.repsMin
      ? Math.max(base.repsMax, Math.min(repsMin + 3, 15))
      : base.repsMax;
  return {
    ...base,
    repsMin,
    repsMax,
    descansoSeg: base.descansoSeg + (edad >= EDAD_MAYOR ? 30 : 0),
  };
}

/** Regla 4 (nivel) + regla 7 (equipamiento; 'cuerpo' siempre permitido). */
function poolFuerza(perfil: Perfil, catalogo: Ejercicio[]): Ejercicio[] {
  return catalogo.filter(
    (e) =>
      e.tipo === 'fuerza' &&
      (e.grupo === 'cuerpo' || perfil.equipamiento.includes(e.grupo)) &&
      (perfil.nivel === 'entrenado' || e.basico),
  );
}

function elegir(
  candidatos: Ejercicio[],
  usados: Set<string>,
  edad: number,
  rng: () => number,
): Ejercicio | null {
  let libres = candidatos.filter((e) => !usados.has(e.id));
  if (edad >= EDAD_MAYOR) {
    // Regla 2: 55+ evita pesas libres si hay alternativa
    const sinPesas = libres.filter((e) => e.grupo !== 'pesas');
    if (sinPesas.length > 0) libres = sinPesas;
  }
  if (libres.length === 0) return null;
  return libres[Math.floor(rng() * libres.length)] ?? null;
}

function armarDia(
  plantilla: PlantillaDia,
  pool: Ejercicio[],
  perfil: Perfil,
  rng: () => number,
): DiaRutina {
  const objetivoDosis = dosis(perfil.objetivo, perfil.edad);
  // Regla 2: 55+ hace un ejercicio menos por día
  const slots =
    perfil.edad >= EDAD_MAYOR ? plantilla.slots.slice(0, -1) : plantilla.slots;
  const usados = new Set<string>();
  const ejercicios: EjercicioRutina[] = [];

  for (const slot of slots) {
    for (const prefijo of slot) {
      const candidatos = pool.filter((e) => e.movimiento.startsWith(prefijo));
      const elegido = elegir(candidatos, usados, perfil.edad, rng);
      if (elegido) {
        usados.add(elegido.id);
        ejercicios.push({ movimiento: elegido.movimiento, ejercicioId: elegido.id, ...objetivoDosis });
        break;
      }
    }
  }

  // Garantía de rutina no vacía: si el pool es chico (equipamiento limitado),
  // completar hasta el mínimo con lo que haya disponible.
  while (ejercicios.length < MIN_EJERCICIOS_DIA) {
    const relleno = elegir(pool, usados, perfil.edad, rng);
    if (!relleno) break;
    usados.add(relleno.id);
    ejercicios.push({ movimiento: relleno.movimiento, ejercicioId: relleno.id, ...objetivoDosis });
  }

  return { nombre: plantilla.nombre, enfoque: plantilla.enfoque, ejercicios };
}

export function generarRutina(
  perfil: Perfil,
  catalogo: Ejercicio[],
  seed: number,
  hoyISO?: string,
): Rutina {
  const rng = crearRng(seed);
  const pool = poolFuerza(perfil, catalogo);
  return {
    generadaEl: hoyISO ?? new Date().toISOString().slice(0, 10),
    seed,
    origen: 'reglas',
    dias: splitPara(perfil.dias).map((plantilla) => armarDia(plantilla, pool, perfil, rng)),
  };
}

/** Sesión corta de elongación (8-10 min) para mañanas o días sin fuerza. */
export function generarElongacion(
  perfil: Perfil,
  catalogo: Ejercicio[],
  seed: number,
): DiaRutina {
  const rng = crearRng(seed);
  const pool = catalogo.filter(
    (e) =>
      e.tipo === 'elongacion' &&
      (e.grupo === 'cuerpo' || perfil.equipamiento.includes(e.grupo)),
  );
  const mezclado = [...pool].sort(() => rng() - 0.5);
  const objetivoCantidad = Math.min(7, Math.max(5, mezclado.length));

  // cubrir músculos distintos primero, después completar
  const porMusculo: Ejercicio[] = [];
  const musculosVistos = new Set<string>();
  for (const e of mezclado) {
    if (!musculosVistos.has(e.musculo)) {
      musculosVistos.add(e.musculo);
      porMusculo.push(e);
    }
  }
  const restantes = mezclado.filter((e) => !porMusculo.includes(e));
  const elegidos = [...porMusculo, ...restantes].slice(0, objetivoCantidad);

  return {
    nombre: 'Elongación',
    enfoque: 'movilidad general (mañanas / días libres)',
    ejercicios: elegidos.map((e) => ({
      movimiento: e.movimiento,
      ejercicioId: e.id,
      series: 1,
      repsMin: 20, // segundos de mantenimiento
      repsMax: 30,
      descansoSeg: 10,
    })),
  };
}

// ---------------------------------------------------------------------------
// Salteo, última vez, variantes, regenerar

export interface ResultadoSalteo {
  tipo: 'normal' | 'pendiente' | 'combinada' | 'reset';
  diaIndex: number;
  mensaje: string;
  /** Solo en 'combinada': hasta 4 compuestos de los días perdidos. */
  ejercicios?: EjercicioRutina[];
}

const MS_POR_DIA = 86_400_000;
const ES_COMPUESTO = /^(empuje|traccion|piernas-empuje|cadera)-/;

function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(hastaISO) - Date.parse(desdeISO)) / MS_POR_DIA);
}

/** Regla 6 del design doc: qué toca hoy según lo salteado. */
export function resolverSalteo(
  rutina: Rutina,
  sesiones: Sesion[],
  hoyISO: string,
): ResultadoSalteo {
  const fuerza = sesiones
    .filter((s) => s.tipo === 'fuerza' && s.diaIndex !== undefined)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ultima = fuerza[fuerza.length - 1];
  const totalDias = rutina.dias.length;

  if (!ultima) {
    return {
      tipo: 'normal',
      diaIndex: 0,
      mensaje: `Te toca ${rutina.dias[0]?.nombre ?? 'el primer día'}.`,
    };
  }

  const transcurridos = diasEntre(ultima.fecha, hoyISO);
  const siguiente = ((ultima.diaIndex ?? 0) + 1) % totalDias;

  if (transcurridos > 7) {
    return {
      tipo: 'reset',
      diaIndex: 0,
      mensaje: 'Pasó más de una semana sin entrenar — arrancamos la semana de nuevo.',
    };
  }

  const gap = Math.max(1, Math.round(7 / totalDias));
  const salteados = Math.max(0, Math.floor(transcurridos / gap) - 1);

  if (salteados === 0) {
    return {
      tipo: 'normal',
      diaIndex: siguiente,
      mensaje: `Te toca ${rutina.dias[siguiente]?.nombre ?? ''}.`,
    };
  }

  if (salteados === 1) {
    return {
      tipo: 'pendiente',
      diaIndex: siguiente,
      mensaje: `Te quedó pendiente ${rutina.dias[siguiente]?.nombre ?? 'una sesión'} — la semana se corre un día.`,
    };
  }

  const perdidos = Array.from(
    { length: Math.min(salteados, totalDias) },
    (_, i) => (siguiente + i) % totalDias,
  );
  const compuestos = perdidos
    .flatMap((i) => rutina.dias[i]?.ejercicios ?? [])
    .filter((e) => ES_COMPUESTO.test(e.movimiento))
    .slice(0, 4);
  return {
    tipo: 'combinada',
    diaIndex: siguiente,
    mensaje: `Salteaste ${salteados} sesiones — te propongo una combinada corta con lo esencial.`,
    ejercicios: compuestos,
  };
}

export interface RegistroUltimaVez {
  fecha: string;
  series: SerieHecha[];
  /** RPE de esa sesión, si se registró (A6: va en la línea "última vez"). */
  rpe?: number;
}

/** Última vez que se hizo ESE ejercicio con ESA variante (regla 8). */
export function ultimaVez(
  sesiones: Sesion[],
  ejercicioId: string,
  variante: GrupoEquip,
): RegistroUltimaVez | null {
  return ultimaVezDeIds(sesiones, new Set([ejercicioId]), variante);
}

/** Última vez del MOVIMIENTO con esa variante (sirve tras un swap de ejercicio). */
export function ultimaVezMovimiento(
  sesiones: Sesion[],
  movimiento: string,
  variante: GrupoEquip,
  catalogo: Ejercicio[],
): RegistroUltimaVez | null {
  const ids = new Set(catalogo.filter((e) => e.movimiento === movimiento).map((e) => e.id));
  return ultimaVezDeIds(sesiones, ids, variante);
}

function ultimaVezDeIds(
  sesiones: Sesion[],
  ids: Set<string>,
  variante: GrupoEquip,
): RegistroUltimaVez | null {
  const ordenadas = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const sesion of ordenadas) {
    const item = sesion.items?.find((i) => ids.has(i.ejercicioId) && i.variante === variante);
    if (item) {
      return {
        fecha: sesion.fecha,
        series: item.series,
        ...(sesion.rpe !== undefined ? { rpe: sesion.rpe } : {}),
      };
    }
  }
  return null;
}

const TODOS_LOS_GRUPOS: GrupoEquip[] = ['banda', 'pesas', 'maquina', 'cuerpo', 'pelota', 'rodillo'];

/** Variantes de un movimiento por grupo, para el selector "¿con qué lo hacés?". */
export function variantesDe(
  catalogo: Ejercicio[],
  movimiento: string,
): Record<GrupoEquip, Ejercicio[]> {
  const resultado = Object.fromEntries(
    TODOS_LOS_GRUPOS.map((g) => [g, [] as Ejercicio[]]),
  ) as Record<GrupoEquip, Ejercicio[]>;
  for (const e of catalogo) {
    if (e.movimiento === movimiento) resultado[e.grupo].push(e);
  }
  return resultado;
}

/** Nueva rutina con otro seed, misma estructura (rota equivalentes). */
export function regenerar(rutina: Rutina, catalogo: Ejercicio[], perfil: Perfil): Rutina {
  return generarRutina(perfil, catalogo, rutina.seed + 1);
}
