// Sacar el respaldo fuera del teléfono con un toque. Usa el "compartir" nativo
// del celular (Drive, WhatsApp, mail…) para que la copia quede en la nube y no
// solo en Descargas, que se va con el teléfono. Si el navegador no comparte
// archivos, cae a la descarga de siempre.

import { storage } from '../lib/storage';

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

function descargar(texto: string, nombre: string): void {
  const blob = new Blob([texto], { type: 'application/json' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(enlace.href);
}

/**
 * Comparte (o descarga) el backup completo. Devuelve qué pasó para que la UI
 * muestre el mensaje justo. Solo marca como respaldado si de verdad salió: si
 * el usuario cancela el menú de compartir, no miente diciendo que se guardó.
 */
export async function respaldar(hoy: string): Promise<ResultadoRespaldo> {
  const texto = storage.exportarBackup();
  const nombre = `guia-ejercicios-backup-${hoy}.json`;

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const archivo = new File([texto], nombre, { type: 'application/json' });
    if (nav.canShare({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: 'Respaldo Guía de Ejercicios' });
        marcarRespaldado(hoy);
        return 'compartido';
      } catch (error) {
        // El usuario cerró el menú: no se guardó nada, no marcamos.
        if (error instanceof Error && error.name === 'AbortError') return 'cancelado';
        // Cualquier otro error (permiso, no soportado): caemos a descarga.
      }
    }
  }

  descargar(texto, nombre);
  marcarRespaldado(hoy);
  return 'descargado';
}
