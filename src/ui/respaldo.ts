// Sacar el respaldo fuera del teléfono con un toque. Usa el "compartir" nativo
// del celular (Drive, WhatsApp, mail…) para que la copia quede en la nube y no
// solo en Descargas, que se va con el teléfono. Si el navegador no comparte
// archivos, cae a la descarga de siempre.

import { storage } from '../lib/storage';
import { compartirArchivo } from './compartir';

const CLAVE_ULTIMO = 'ge:ultimoBackup';

export type ResultadoRespaldo = 'compartido' | 'descargado' | 'cancelado';

/** Marca que se respaldó hoy (corta el recordatorio). */
export function marcarRespaldado(hoy: string): void {
  try {
    localStorage.setItem(CLAVE_ULTIMO, hoy);
  } catch {
    // modo privado / sin espacio: el respaldo igual se hizo, solo no recordamos la fecha
  }
}

export function ultimoRespaldo(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMO);
  } catch {
    return null;
  }
}

/**
 * Comparte (o descarga) el backup completo. Devuelve qué pasó para que la UI
 * muestre el mensaje justo. Solo marca como respaldado si de verdad salió: si
 * el usuario cancela el menú de compartir, no miente diciendo que se guardó.
 */
export async function respaldar(hoy: string): Promise<ResultadoRespaldo> {
  const resultado = await compartirArchivo(
    storage.exportarBackup(),
    `guia-ejercicios-backup-${hoy}.json`,
    'application/json',
    'Respaldo Guía de Ejercicios',
  );
  // Si canceló el menú no salió nada: no marcamos respaldado.
  if (resultado !== 'cancelado') marcarRespaldado(hoy);
  return resultado;
}
