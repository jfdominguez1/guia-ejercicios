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

/** "8-12 reps" · "20-30 seg" · "2-5 min" (rango igual colapsa: "5 min"). */
export function formatearObjetivo(
  ejercicio: EjercicioRutina,
  tipoEjercicio: TipoEjercicio,
): string {
  const unidad = unidadEfectiva(ejercicio, tipoEjercicio);
  const rango =
    ejercicio.repsMin === ejercicio.repsMax
      ? `${ejercicio.repsMin}`
      : `${ejercicio.repsMin}-${ejercicio.repsMax}`;
  return `${rango} ${unidad}`;
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
