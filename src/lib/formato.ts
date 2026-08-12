// Helpers puros de presentación de la dosis de un ejercicio de rutina.
// La UI (Fase 3) los usa para mostrar reps/seg/min, zona de FC y descanso.

import type { EjercicioRutina, TipoEjercicio, UnidadEjercicio } from './tipos';

/**
 * Unidad con retrocompatibilidad: rutinas viejas no traen `unidad` —
 * default 'reps', salvo ejercicios de elongación que se interpretan 'seg'.
 */
export function unidadEfectiva(
  ejercicio: EjercicioRutina,
  tipoEjercicio: TipoEjercicio,
): UnidadEjercicio {
  if (ejercicio.unidad) return ejercicio.unidad;
  return tipoEjercicio === 'elongacion' ? 'seg' : 'reps';
}

/** "8-12" · "20-30" · "5" (un rango sin extremos distintos colapsa). */
function rangoDe(ejercicio: EjercicioRutina): string {
  return ejercicio.repsMin === ejercicio.repsMax
    ? `${ejercicio.repsMin}`
    : `${ejercicio.repsMin}-${ejercicio.repsMax}`;
}

/** "8-12 reps" · "20-30 seg por lado" · "2-5 min". */
export function formatearObjetivo(
  ejercicio: EjercicioRutina,
  tipoEjercicio: TipoEjercicio,
): string {
  const unidad = unidadEfectiva(ejercicio, tipoEjercicio);
  return `${rangoDe(ejercicio)} ${unidad}${ejercicio.porLado ? ' por lado' : ''}`;
}

/**
 * La dosis dicha en palabras: **"Sostené 30-40 seg de cada lado"** en vez de
 * "30-40 seg".
 *
 * JFD reportó que el número se lee igual sea un estiramiento que se aguanta o
 * uno que se repite despacio, y que no sabía cuál era cuál. La unidad ya
 * distingue los dos casos (`seg` vs `reps`); lo que faltaba era decirlo.
 *
 * En elongación las repeticiones son **lentas** — es la diferencia con una
 * serie de fuerza, y la razón por la que el mismo "10-12" significa otra cosa.
 */
export function instruccionDosis(
  ejercicio: EjercicioRutina,
  tipoEjercicio: TipoEjercicio,
): string {
  const unidad = unidadEfectiva(ejercicio, tipoEjercicio);
  const rango = rangoDe(ejercicio);
  const lado = ejercicio.porLado ? ' de cada lado' : '';
  if (unidad === 'seg') return `Sostené ${rango} seg${lado}`;
  if (unidad === 'min') return `${rango} min${lado}`;
  const lentas = tipoEjercicio === 'elongacion' ? ' lentas' : '';
  const plural = ejercicio.repsMax === 1 ? 'repetición' : 'repeticiones';
  return `${rango} ${plural}${lentas}${lado}`;
}

/** "🫀 125-140 ppm", o null si el ejercicio no tiene zona objetivo. */
export function formatearFc(ejercicio: EjercicioRutina): string | null {
  if (!ejercicio.fcObjetivo) return null;
  return `🫀 ${ejercicio.fcObjetivo.min}-${ejercicio.fcObjetivo.max} ppm`;
}

/** En cardio por bloques (unidad min, series > 1) el descanso es recuperación activa. */
export function etiquetaDescanso(
  ejercicio: EjercicioRutina,
  tipoEjercicio: TipoEjercicio,
): 'descanso' | 'recuperación' {
  const esCardioPorBloques =
    unidadEfectiva(ejercicio, tipoEjercicio) === 'min' && ejercicio.series > 1;
  return esCardioPorBloques ? 'recuperación' : 'descanso';
}
