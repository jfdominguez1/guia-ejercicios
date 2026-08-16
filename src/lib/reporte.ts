// "Reportar un problema" — el lugar propio para avisar que algo de la APP anda
// mal. Antes no existía y los reportes viajaban por el primer texto libre a
// mano: la sensación del cardio (09/08), la nota de un ejercicio (12/08) y la
// observación de un ejercicio que ni era el del problema (16/08). Quedaban
// mezclados con el registro de entrenamiento y sin contexto.
//
// El reporte guarda solo: qué pasó (el texto) + cuándo (fecha y hora local) +
// dónde (pantalla y, si hay una sesión en curso, en qué ejercicio iba) + qué
// versión de la app corría. Es lo que el desarrollador necesita para
// reproducirlo sin adivinar.

/** Un problema reportado desde la app. Entra al respaldo y al export de la IA. */
export interface Reporte {
  id: string;
  /** Fecha y hora LOCAL (2026-08-16 19:42) — el momento en que lo escribió. */
  fecha: string;
  /** Ruta de la pantalla donde estaba (p. ej. /guia-ejercicios/entrenar/). */
  pantalla: string;
  /** Sello del bundle (ge-…), si se pudo leer. Sin él no se sabe qué código corría. */
  version?: string;
  /** "Fuerza A · ejercicio 3/8 (0739)" si había una sesión en curso. */
  sesionActiva?: string;
  texto: string;
}

/**
 * Arma el reporte a partir del texto y el contexto ya juntado.
 * Devuelve null si no hay nada que decir (texto vacío o puro espacio).
 */
export function armarReporte(
  texto: string,
  contexto: { fecha: string; pantalla: string; version?: string; sesionActiva?: string },
): Omit<Reporte, 'id'> | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  return {
    fecha: contexto.fecha,
    pantalla: contexto.pantalla,
    ...(contexto.version ? { version: contexto.version } : {}),
    ...(contexto.sesionActiva ? { sesionActiva: contexto.sesionActiva } : {}),
    texto: limpio,
  };
}

/**
 * Describe la sesión en curso a partir del draft crudo del wizard (ge:draft).
 * El draft existe solo mientras hay una sesión sin guardar — al cerrarla se
 * borra — así que si está, es contexto vigente, no basura vieja.
 * Cualquier forma inesperada devuelve undefined: un reporte nunca puede fallar
 * por culpa del contexto.
 */
export function contextoDeDraft(crudo: unknown): string | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const draft = crudo as { nombreDia?: unknown; indice?: unknown; ejercicios?: unknown };
  if (typeof draft.nombreDia !== 'string' || !Array.isArray(draft.ejercicios)) return undefined;
  const total = draft.ejercicios.length;
  const indice = typeof draft.indice === 'number' ? draft.indice : 0;
  const actual = draft.ejercicios[indice] as { ejercicioId?: unknown } | undefined;
  const id = typeof actual?.ejercicioId === 'string' ? ` (${actual.ejercicioId})` : '';
  if (total === 0) return draft.nombreDia;
  return `${draft.nombreDia} · ejercicio ${Math.min(indice + 1, total)}/${total}${id}`;
}

/**
 * Saca el sello del bundle (ge-…) del código de sw.js, que es el único lugar
 * donde la versión queda escrita (la sella el build). Si el texto no lo trae
 * —sw.js sin sellar en dev, respuesta rara— devuelve undefined.
 */
export function versionDeSw(codigo: string): string | undefined {
  const m = codigo.match(/const VERSION = '(ge-[0-9a-f]+)'/);
  return m?.[1];
}

/** 2026-08-16 19:42, en hora LOCAL (toISOString a la noche ya es "mañana"). */
export function fechaHoraLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
