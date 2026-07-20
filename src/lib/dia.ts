// Elegir qué día de la rutina se entrena hoy, pisando lo que propone el motor.
// "Me tocaba piernas pero hoy hago espalda". Funciones puras — sin DOM ni storage.

import type { DiaRutina, Rutina } from './tipos';

/** Override guardado en sessionStorage: vale solo para la fecha en que se eligió. */
export interface DiaElegido {
  fecha: string;
  diaIndex: number;
}

export interface OpcionDia {
  index: number;
  nombre: string;
  enfoque: string;
  cantidad: number;
  /** El que propone el motor de rotación para hoy. */
  sugerido: boolean;
  /** El que está activo ahora mismo (sugerido, salvo que haya override). */
  activo: boolean;
}

/**
 * Interpreta el override crudo. Devuelve null si está roto, si es de otra
 * fecha o si apunta a un día que ya no existe (rutina regenerada o editada).
 */
export function parsearDiaElegido(
  crudo: string | null,
  hoy: string,
  totalDias: number,
): number | null {
  if (!crudo) return null;
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    return null;
  }
  const elegido = dato as Partial<DiaElegido> | null;
  if (!elegido || elegido.fecha !== hoy) return null;
  const index = elegido.diaIndex;
  if (typeof index !== 'number' || !Number.isInteger(index)) return null;
  if (index < 0 || index >= totalDias) return null;
  return index;
}

/** Serializa el override para guardarlo. */
export function serializarDiaElegido(fecha: string, diaIndex: number): string {
  return JSON.stringify({ fecha, diaIndex } satisfies DiaElegido);
}

/**
 * Día que corresponde entrenar hoy: el elegido a mano si hay uno válido,
 * si no el que propone el motor de rotación.
 */
export function resolverDiaDeHoy(
  rutina: Rutina,
  diaSugerido: number,
  diaElegido: number | null,
): { diaIndex: number; dia: DiaRutina; esOverride: boolean } {
  const sugerido = rutina.dias[diaSugerido] ? diaSugerido : 0;
  const usarOverride = diaElegido !== null && diaElegido !== sugerido && !!rutina.dias[diaElegido];
  const diaIndex = usarOverride ? diaElegido : sugerido;
  return { diaIndex, dia: rutina.dias[diaIndex] ?? rutina.dias[0]!, esOverride: usarOverride };
}

/** Lista para el selector "hacer otro día". */
export function opcionesDeDia(
  rutina: Rutina,
  diaSugerido: number,
  diaActivo: number,
): OpcionDia[] {
  return rutina.dias.map((dia, index) => ({
    index,
    nombre: dia.nombre,
    enfoque: dia.enfoque,
    cantidad: dia.ejercicios.length,
    sugerido: index === diaSugerido,
    activo: index === diaActivo,
  }));
}
