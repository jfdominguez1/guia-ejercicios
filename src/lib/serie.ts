// Qué mide una serie ya registrada: repeticiones, segundos o minutos.
//
// Antes todo se guardaba en `reps` sin decir de qué unidad se trataba: una
// plancha de 40 segundos quedaba como "reps: 30" y había que aclararlo en una
// nota de texto libre. El número dejaba de servir para ajustar la rutina —
// ni la app ni la IA podían saber si "30" eran repeticiones o segundos.
//
// `reps` se sigue escribiendo (espeja el valor) para no romper respaldos ni
// código viejo, pero la unidad real la dicen `segundos` / `minutos`.
// Funciones puras.

import type { SerieHecha, UnidadEjercicio } from './tipos';

export interface Medida {
  valor: number;
  unidad: UnidadEjercicio;
}

/** Qué se registró en esta serie, con su unidad. */
export function medidaSerie(serie: SerieHecha): Medida {
  if (serie.segundos !== undefined) return { valor: serie.segundos, unidad: 'seg' };
  if (serie.minutos !== undefined) return { valor: serie.minutos, unidad: 'min' };
  return { valor: serie.reps, unidad: 'reps' };
}

/**
 * Serie con el valor guardado en el campo que corresponde a su unidad. El peso
 * solo se conserva en reps: en un ejercicio por tiempo no significa nada.
 */
export function conMedida(serie: SerieHecha, valor: number, unidad: UnidadEjercicio): SerieHecha {
  const base = { ...serie, reps: valor };
  delete base.segundos;
  delete base.minutos;
  if (unidad === 'reps') return base;
  delete base.pesoKg;
  return unidad === 'seg' ? { ...base, segundos: valor } : { ...base, minutos: valor };
}

/** Nombre largo, para etiquetas de campo ("Segundos"). */
export const NOMBRE_UNIDAD: Record<UnidadEjercicio, string> = {
  reps: 'Repeticiones',
  seg: 'Segundos',
  min: 'Minutos',
};

/** "40 seg" · "12 reps" — el número nunca viaja solo. */
export function formatearMedida(medida: Medida): string {
  return `${medida.valor} ${medida.unidad}`;
}

/** Cronómetro: segundos a "0:45" / "1:05". */
export function formatearCrono(segundos: number): string {
  const min = Math.floor(segundos / 60);
  return `${min}:${String(segundos % 60).padStart(2, '0')}`;
}
