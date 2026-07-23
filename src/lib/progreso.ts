// El motor de progreso: la historia de un ejercicio en el tiempo y qué hacer
// hoy con él. Lo comparten la ficha (curva) y el wizard (sugerencia).
// Funciones puras — sin DOM ni storage.

import { unidadEfectiva } from './formato';
import { formatearPeso, PASO } from './unidades';
import type { Ejercicio, EjercicioRutina, GrupoEquip, SerieHecha, Sesion } from './tipos';

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/**
 * 1RM estimado con la fórmula de Epley: peso × (1 + reps/30). Une reps y peso
 * en UN número comparable entre sesiones — porque el peso solo miente cuando
 * cambian las reps (20 kg × 10 es más trabajo que 40 kg × 1 para hipertrofia).
 * Es un ESTIMADO; se comunica como tal en la UI, no sirve para testear 1RM real.
 */
export function estimarE1RM(reps: number, pesoKg: number): number {
  return redondear(pesoKg * (1 + reps / 30), 1);
}

/** Puntaje interno para elegir la mejor serie: e1RM si hay peso, si no las reps. */
function puntajeSerie(s: SerieHecha): number {
  return s.pesoKg === undefined || s.pesoKg <= 0 ? s.reps / 100 : estimarE1RM(s.reps, s.pesoKg);
}

/** La serie "tope" de un item: la de mayor e1RM (no la más pesada a secas). */
export function serieTope(series: SerieHecha[]): SerieHecha | null {
  if (!series.length) return null;
  return series.reduce((mejor, s) => (puntajeSerie(s) > puntajeSerie(mejor) ? s : mejor));
}

export interface PuntoProgreso {
  fecha: string;
  /** Peso de la serie tope (kg). 0 si fue a peso corporal. */
  pesoTope: number;
  repsTope: number;
  /** 1RM estimado de la serie tope. 0 sin peso. */
  e1rm: number;
  /** Trabajo total del día: Σ reps × peso. */
  volumen: number;
}

/**
 * Un punto por cada sesión que tocó ese movimiento con esa variante, ordenado
 * del más viejo al más nuevo. Junta las variantes del mismo movimiento tras un
 * swap solo si coincide el grupo pedido. Salteados (sin series) se ignoran.
 */
export function historialMovimiento(
  sesiones: Sesion[],
  movimiento: string,
  variante: GrupoEquip,
  catalogo: Ejercicio[],
): PuntoProgreso[] {
  const ids = new Set(catalogo.filter((e) => e.movimiento === movimiento).map((e) => e.id));
  const puntos: PuntoProgreso[] = [];
  for (const sesion of [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const item = sesion.items?.find((i) => ids.has(i.ejercicioId) && i.variante === variante);
    if (!item || !item.series.length) continue;
    const tope = serieTope(item.series);
    if (!tope) continue;
    puntos.push({
      fecha: sesion.fecha,
      pesoTope: tope.pesoKg ?? 0,
      repsTope: tope.reps,
      e1rm: tope.pesoKg === undefined ? 0 : estimarE1RM(tope.reps, tope.pesoKg),
      volumen: item.series.reduce((v, s) => v + s.reps * (s.pesoKg ?? 0), 0),
    });
  }
  return puntos;
}

/** Primer vs último punto de una curva, para la línea "de X a Y". */
export function tendencia(
  puntos: PuntoProgreso[],
): { primero: PuntoProgreso; ultimo: PuntoProgreso; deltaPesoPct: number } | null {
  if (puntos.length < 2) return null;
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;
  const deltaPesoPct = primero.pesoTope > 0
    ? Math.round(((ultimo.pesoTope - primero.pesoTope) / primero.pesoTope) * 100)
    : 0;
  return { primero, ultimo, deltaPesoPct };
}

export type Sugerencia =
  | { tipo: 'subir-peso'; pesoKg: number; reps: number; texto: string }
  | { tipo: 'subir-reps'; pesoKg: number; reps: number; texto: string }
  | { tipo: 'mantener'; pesoKg: number; reps: number; texto: string }
  | { tipo: 'sin-datos'; texto: string };

/**
 * Doble progresión: qué hacer HOY según lo que hiciste la última vez.
 *
 * - Completaste todas las series al TOPE del rango de reps → subí el peso un
 *   paso y volvé al piso de reps.
 * - Llegaste al piso pero no al tope → misma carga, una rep más.
 * - No llegaste ni al piso → consolidá la carga (no subas).
 *
 * Solo aplica a fuerza. La carga no progresa en cardio/elongación.
 * `ultimaSeries` son las series de la última vez (de `ultimaVezMovimiento`).
 */
export function sugerirProgresion(
  ultimaSeries: SerieHecha[] | null,
  plan: EjercicioRutina,
  info: Ejercicio,
): Sugerencia {
  // Una plancha es de tipo 'fuerza' pero se mide en segundos: ahí el peso no
  // progresa, progresa el tiempo. La unidad manda, no solo el tipo.
  if (info.tipo !== 'fuerza' || unidadEfectiva(plan, info.tipo) !== 'reps') {
    return { tipo: 'sin-datos', texto: 'Progresá el tiempo o la intensidad, no el peso.' };
  }
  const conPeso = (ultimaSeries ?? []).filter(
    (s): s is SerieHecha & { pesoKg: number } => s.pesoKg !== undefined && s.pesoKg > 0,
  );
  if (!conPeso.length) {
    return {
      tipo: 'sin-datos',
      texto: plan.pesoInicialKg !== undefined
        ? `Arrancá con ${formatearPeso(plan.pesoInicialKg)} y ajustá.`
        : 'Arrancá cómodo y ajustá.',
    };
  }
  const pesoTrabajo = Math.max(...conPeso.map((s) => s.pesoKg));
  const seriesTrabajo = conPeso.filter((s) => s.pesoKg === pesoTrabajo);
  const repsMaxHechas = Math.max(...seriesTrabajo.map((s) => s.reps));

  if (seriesTrabajo.every((s) => s.reps >= plan.repsMax)) {
    const nuevo = pesoTrabajo + PASO.kg;
    return {
      tipo: 'subir-peso',
      pesoKg: nuevo,
      reps: plan.repsMin,
      texto: `Cerraste ${seriesTrabajo.length}×${plan.repsMax} con ${formatearPeso(pesoTrabajo)}. Probá ${formatearPeso(nuevo)} × ${plan.repsMin}.`,
    };
  }
  if (repsMaxHechas >= plan.repsMin) {
    const objetivo = Math.min(repsMaxHechas + 1, plan.repsMax);
    return {
      tipo: 'subir-reps',
      pesoKg: pesoTrabajo,
      reps: objetivo,
      texto: `Misma carga (${formatearPeso(pesoTrabajo)}), apuntá a ${objetivo} reps.`,
    };
  }
  return {
    tipo: 'mantener',
    pesoKg: pesoTrabajo,
    reps: plan.repsMin,
    texto: `Consolidá ${formatearPeso(pesoTrabajo)} hasta cerrar ${plan.repsMin} reps parejas.`,
  };
}
