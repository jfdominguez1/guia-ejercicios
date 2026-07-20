// Cuándo recordar un respaldo. La app vive en el localStorage de un solo
// teléfono: si el SO lo borra (pasó), no hay vuelta atrás salvo un archivo que
// el usuario haya sacado afuera. Esto decide cuándo empujarlo a hacerlo, sin
// molestar de más. Funciones puras — sin DOM ni storage.

const MS_POR_DIA = 86_400_000;

/** Días sin respaldar a partir de los cuales conviene recordar. */
export const UMBRAL_RESPALDO_DIAS = 7;

export interface EstadoRespaldo {
  /** Días desde el último respaldo. null = nunca respaldó. */
  dias: number | null;
  /** ¿Mostrar el recordatorio? */
  avisar: boolean;
}

/**
 * @param ultimoISO fecha del último respaldo ('YYYY-MM-DD') o null si nunca.
 * @param hoy fecha de hoy.
 * @param hayDatos si no hay nada que perder (usuario recién llegado), no avisa.
 */
export function estadoRespaldo(
  ultimoISO: string | null,
  hoy: string,
  hayDatos: boolean,
): EstadoRespaldo {
  if (!hayDatos) return { dias: null, avisar: false };
  if (!ultimoISO) return { dias: null, avisar: true };
  const dias = Math.max(0, Math.round((Date.parse(hoy) - Date.parse(ultimoISO)) / MS_POR_DIA));
  return { dias, avisar: dias >= UMBRAL_RESPALDO_DIAS };
}

/** El texto del recordatorio. Empuja, no culpa. */
export function textoRespaldo(estado: EstadoRespaldo): string {
  if (estado.dias === null) return 'Todo vive en este teléfono. Sacá una copia afuera (1 toque).';
  if (estado.dias === 1) return 'Hace 1 día que no respaldás. Sacá una copia afuera (1 toque).';
  return `Hace ${estado.dias} días que no respaldás. Sacá una copia afuera (1 toque).`;
}
