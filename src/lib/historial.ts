// Editar y borrar sesiones ya registradas. El historial es el dato más caro de
// la app (no se puede recuperar), así que todo pasa por validación explícita.
// Funciones puras e inmutables — sin DOM ni storage.

import type { ItemSesion, Sesion, TipoSesion } from './tipos';

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

/**
 * Le pone id a las sesiones que no lo tengan (las registradas antes de que
 * existiera el campo). Devuelve el mismo array si ya estaban todas al día,
 * para que el llamador sepa si hace falta persistir.
 */
export function asegurarIds(sesiones: Sesion[], generarId: () => string): Sesion[] {
  if (sesiones.every((s) => s.id)) return sesiones;
  return sesiones.map((s) => (s.id ? s : { ...s, id: generarId() }));
}

/** Saca las claves en `undefined` para no guardar campos vacíos. */
function limpiar<T extends object>(objeto: T): T {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Aplica la edición a la sesión con ese id. Devuelve el array original si el
 * id no existe o si la edición no valida — nunca guarda a medias.
 */
export function editarSesion(
  sesiones: Sesion[],
  id: string,
  edicion: EdicionSesion,
  hoy: string,
): Sesion[] {
  const index = sesiones.findIndex((s) => s.id === id);
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

/** Saca la sesión con ese id. */
export function borrarSesion(sesiones: Sesion[], id: string): Sesion[] {
  if (!sesiones.some((s) => s.id === id)) return sesiones;
  return sesiones.filter((s) => s.id !== id);
}

/** Cuántas sesiones borradas se guardan antes de descartar la más vieja. */
export const MAX_PAPELERA = 10;

/**
 * Guarda la borrada al frente de la papelera. Es lo que permite ofrecer
 * "Deshacer" en vez de pedir dos confirmaciones: un undo real protege más que
 * preguntar dos veces, que solo entrena a decir que sí dos veces.
 */
export function enviarAPapelera(papelera: Sesion[], sesion: Sesion): Sesion[] {
  return [sesion, ...papelera.filter((s) => s.id !== sesion.id)].slice(0, MAX_PAPELERA);
}

/**
 * Saca la sesión de la papelera y la devuelve para reinsertarla. Si ya no
 * está (se pasó del tope), devuelve null y el llamador no hace nada.
 */
export function restaurarDePapelera(
  papelera: Sesion[],
  id: string,
): { sesion: Sesion; papelera: Sesion[] } | null {
  const sesion = papelera.find((s) => s.id === id);
  if (!sesion) return null;
  return { sesion, papelera: papelera.filter((s) => s.id !== id) };
}

/** Reinserta manteniendo el orden por fecha (el listado ordena igual). */
export function reinsertar(sesiones: Sesion[], sesion: Sesion): Sesion[] {
  if (sesiones.some((s) => s.id === sesion.id)) return sesiones;
  return [...sesiones, sesion].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Busca por id (para confirmar antes de borrar, precargar el form, etc.). */
export function buscarSesion(sesiones: Sesion[], id: string): Sesion | undefined {
  return sesiones.find((s) => s.id === id);
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

export interface FiltroHistorial {
  /** 'todas' o un tipo puntual. */
  tipo: TipoSesion | 'todas';
  /** 'todos' o un mes 'YYYY-MM'. */
  mes: string;
}

export const FILTRO_VACIO: FiltroHistorial = { tipo: 'todas', mes: 'todos' };

/** Meses con al menos una sesión, del más nuevo al más viejo. */
export function mesesConSesiones(sesiones: Sesion[]): string[] {
  return [...new Set(sesiones.map((s) => s.fecha.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
}

/** Aplica el filtro y ordena de la más nueva a la más vieja. */
export function filtrarSesiones(sesiones: Sesion[], filtro: FiltroHistorial): Sesion[] {
  return sesiones
    .filter((s) => filtro.tipo === 'todas' || s.tipo === filtro.tipo)
    .filter((s) => filtro.mes === 'todos' || s.fecha.startsWith(filtro.mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Tipos distintos registrados ese día — un día puede tener fuerza Y cardio. */
export function tiposDelDia(sesiones: Sesion[], fecha: string): TipoSesion[] {
  return [...new Set(sesiones.filter((s) => s.fecha === fecha).map((s) => s.tipo))];
}
