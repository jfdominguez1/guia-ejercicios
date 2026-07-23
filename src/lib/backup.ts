// Recuperar el historial de un respaldo SIN pisar lo que ya hay en el teléfono.
//
// `storage.restaurarBackup` reemplaza todas las claves: sirve para un teléfono
// nuevo, pero es destructivo si el respaldo es viejo y en el equipo ya hay
// sesiones nuevas (pasó: el respaldo del 20/07 tenía 8 sesiones y en el
// teléfono había 3 posteriores). Acá el historial se FUSIONA: se suman las que
// faltan y nunca se borra ni se pisa una sesión existente.
//
// Funciones puras — sin DOM ni localStorage.

import type { Sesion } from './tipos';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function esSesion(crudo: unknown): crudo is Sesion {
  if (typeof crudo !== 'object' || crudo === null) return false;
  const s = crudo as Record<string, unknown>;
  return typeof s.fecha === 'string' && FECHA_ISO.test(s.fecha) && typeof s.tipo === 'string';
}

/**
 * Sesiones de un archivo de respaldo. `null` si el archivo no es un respaldo de
 * la app; lista vacía si es un respaldo válido pero sin historial.
 */
export function leerSesionesDeBackup(texto: string): Sesion[] | null {
  let backup: { app?: unknown; datos?: Record<string, unknown> };
  try {
    backup = JSON.parse(texto) as typeof backup;
  } catch {
    return null;
  }
  if (!backup?.datos || typeof backup.datos !== 'object') return null;
  const crudas = backup.datos.sesiones;
  if (crudas == null) return [];
  if (!Array.isArray(crudas)) return null;
  return crudas.filter(esSesion);
}

/**
 * Identidad de una sesión sin id (respaldos anteriores a que el campo
 * existiera). Incluye el día para no fusionar dos sesiones distintas del mismo
 * día: el 20/07 hubo dos de fuerza, "Día 1" y "Día 3".
 */
function huella(sesion: Sesion): string {
  return [sesion.fecha, sesion.tipo, sesion.diaRutina ?? '', sesion.estado ?? 'hecha'].join('|');
}

export interface ResultadoFusion {
  sesiones: Sesion[];
  agregadas: number;
  /** Ya estaban (mismo id o misma fecha/tipo/día): no se tocaron. */
  omitidas: number;
}

/**
 * Suma al historial actual las sesiones del respaldo que falten, ordenadas por
 * fecha. Las que ya están se dejan como están — el dato del teléfono manda,
 * porque puede haberse editado después del respaldo.
 */
export function fusionarSesiones(
  actuales: Sesion[],
  entrantes: Sesion[],
  generarId: () => string,
): ResultadoFusion {
  const ids = new Set(actuales.filter((s) => s.id).map((s) => s.id));
  const huellas = new Set(actuales.map(huella));
  const nuevas: Sesion[] = [];
  for (const sesion of entrantes) {
    if ((sesion.id && ids.has(sesion.id)) || huellas.has(huella(sesion))) continue;
    const conId = sesion.id ? sesion : { ...sesion, id: generarId() };
    ids.add(conId.id);
    huellas.add(huella(conId));
    nuevas.push(conId);
  }
  if (nuevas.length === 0) {
    return { sesiones: actuales, agregadas: 0, omitidas: entrantes.length };
  }
  return {
    sesiones: [...actuales, ...nuevas].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    agregadas: nuevas.length,
    omitidas: entrantes.length - nuevas.length,
  };
}
