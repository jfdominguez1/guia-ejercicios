// Sacar cosas de la app hacia afuera con el "compartir" nativo del celular
// (WhatsApp, Drive, mail). Dos formas, porque no son intercambiables:
//   - archivo: para lo largo (el respaldo, el pedido para la IA). WhatsApp corta
//     los mensajes largos, pero manda un adjunto sin tocarlo.
//   - texto: para lo corto y legible (la rutina), que se lee en el chat mismo.
// Si el navegador no comparte, cada una cae a lo mejor que puede: descargar el
// archivo o copiar el texto al portapapeles.

export type ResultadoArchivo = 'compartido' | 'descargado' | 'cancelado';
export type ResultadoTexto = 'compartido' | 'copiado' | 'cancelado' | 'fallo';

type NavCompartir = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

/** El usuario cerró el menú de compartir: no salió nada, y no es un error. */
function esCancelacion(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function descargar(texto: string, nombre: string, tipo: string): void {
  const blob = new Blob([texto], { type: tipo });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(enlace.href);
}

/**
 * Comparte `texto` como archivo adjunto. Devuelve qué pasó de verdad para que
 * la UI no mienta ("copia enviada" cuando el usuario canceló).
 */
export async function compartirArchivo(
  texto: string,
  nombre: string,
  tipo: string,
  titulo: string,
): Promise<ResultadoArchivo> {
  const nav = navigator as NavCompartir;
  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const archivo = new File([texto], nombre, { type: tipo });
    if (nav.canShare({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: titulo });
        return 'compartido';
      } catch (error) {
        if (esCancelacion(error)) return 'cancelado';
        // Permiso, no soportado, etc.: caemos a la descarga.
      }
    }
  }
  descargar(texto, nombre, tipo);
  return 'descargado';
}

/** Comparte `texto` como mensaje. Fallback: portapapeles. */
export async function compartirTexto(texto: string, titulo: string): Promise<ResultadoTexto> {
  const nav = navigator as NavCompartir;
  if (nav.share) {
    try {
      await nav.share({ text: texto, title: titulo });
      return 'compartido';
    } catch (error) {
      if (esCancelacion(error)) return 'cancelado';
      // Sigue al portapapeles.
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    return 'fallo';
  }
}
