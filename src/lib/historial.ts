// Editar y borrar sesiones ya registradas. El historial es el dato más caro de
// la app (no se puede recuperar), así que todo pasa por validación explícita.
// Funciones puras e inmutables — sin DOM ni storage.

import type { ItemSesion, Sesion } from './tipos';

/** Campos editables de una sesión. `undefined` = se borra el campo. */
export interface EdicionSesion {
  fecha: string;
  rpe?: number;
  notas?: string;
  fcPromedio?: number;
  duracionMin?: number;
  cardio?: { minutos: number; km?: number; sensacion?: string };
  items?: ItemSesion[];
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTAS = 500;

function enRango(valor: number | undefined, min: number, max: number): boolean {
  return valor === undefined || (Number.isFinite(valor) && valor >= min && valor <= max);
}

/**
 * Errores de una edición, en castellano y listos para mostrar.
 * Vacío = se puede guardar.
 */
export function validarEdicion(edicion: EdicionSesion, hoy: string): string[] {
  const errores: string[] = [];
  if (!FECHA_ISO.test(edicion.fecha)) errores.push('La fecha no es válida.');
  else if (edicion.fecha > hoy) errores.push('No se puede registrar una sesión en el futuro.');
  if (!enRango(edicion.rpe, 1, 10)) errores.push('El RPE va de 1 a 10.');
  if (!enRango(edicion.fcPromedio, 40, 220)) errores.push('La FC promedio va entre 40 y 220 ppm.');
  if (!enRango(edicion.duracionMin, 1, 600)) errores.push('La duración va entre 1 y 600 minutos.');
  if (edicion.cardio) {
    if (!enRango(edicion.cardio.minutos, 1, 600)) errores.push('Los minutos de cardio van entre 1 y 600.');
    if (!enRango(edicion.cardio.km, 0, 500)) errores.push('Los km van entre 0 y 500.');
  }
  if ((edicion.notas?.length ?? 0) > MAX_NOTAS) errores.push(`Las notas no pueden pasar de ${MAX_NOTAS} caracteres.`);
  for (const item of edicion.items ?? []) {
    for (const serie of item.series) {
      if (!enRango(serie.reps, 0, 1000)) errores.push('Las repeticiones van de 0 a 1000.');
      if (!enRango(serie.pesoKg, 0, 1000)) errores.push('El peso va de 0 a 1000 kg.');
    }
  }
  return [...new Set(errores)];
}

/** Saca las claves en `undefined` para no guardar campos vacíos. */
function limpiar<T extends object>(objeto: T): T {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Aplica la edición a la sesión de esa posición. Devuelve el array original
 * si el índice no existe o si la edición no valida.
 */
export function editarSesion(
  sesiones: Sesion[],
  index: number,
  edicion: EdicionSesion,
  hoy: string,
): Sesion[] {
  const actual = sesiones[index];
  if (!actual) return sesiones;
  if (validarEdicion(edicion, hoy).length) return sesiones;
  const { fecha, rpe, notas, fcPromedio, duracionMin, cardio, items } = edicion;
  const editada = limpiar<Sesion>({
    ...actual,
    fecha,
    rpe,
    notas: notas?.trim() || undefined,
    fcPromedio,
    duracionMin,
    ...(actual.cardio && cardio ? { cardio: limpiar({ ...actual.cardio, ...cardio }) } : {}),
    ...(items ? { items } : {}),
  });
  return sesiones.map((s, i) => (i === index ? editada : s));
}

/** Saca la sesión de esa posición. */
export function borrarSesion(sesiones: Sesion[], index: number): Sesion[] {
  if (!sesiones[index]) return sesiones;
  return sesiones.filter((_, i) => i !== index);
}

/** Resumen de una línea para confirmar antes de borrar ("qué estoy borrando"). */
export function describirSesion(sesion: Sesion): string {
  const partes: string[] = [sesion.fecha];
  if (sesion.diaRutina) partes.push(sesion.diaRutina);
  else partes.push(sesion.tipo);
  if (sesion.cardio) partes.push(`${sesion.cardio.tipo} ${sesion.cardio.minutos} min`);
  const series = (sesion.items ?? []).reduce((total, i) => total + i.series.length, 0);
  if (series) partes.push(`${series} series`);
  return partes.join(' · ');
}
