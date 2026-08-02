// Qué le pasa a los bloques guardados cuando se importa un archivo de rutina.
// Función pura — sin DOM ni storage.
//
// El importador fusiona por NOMBRE: el que ya existe se pisa, el nuevo se
// agrega, y el que el archivo no menciona queda intacto. Eso está bien, pero
// tiene una consecuencia que no se ve: si el archivo RENOMBRA un bloque, el
// viejo no se renombra — queda ahí, huérfano, al lado del nuevo. Caso real: el
// archivo v8 renombró "Elongación post-caminata (10 min)" a "Elongación
// post-cardio · 10 min (bici o caminata)" y el resultado son dos bloques casi
// iguales, sin ningún aviso.
//
// Mostrar los nombres antes de confirmar no lo arregla, pero lo hace visible:
// alcanza para que se note y se borre el viejo.

import type { GrupoGuardado } from './tipos';

export interface CambiosBloques {
  /** Ya existía con ese nombre: el archivo lo reemplaza. */
  pisa: string[];
  /** Nombre que no estaba: se agrega. */
  agrega: string[];
  /** Guardados que el archivo no menciona: quedan como están. */
  intactos: string[];
}

export function cambiosDeBloques(
  guardados: GrupoGuardado[],
  delArchivo: GrupoGuardado[],
): CambiosBloques {
  const existentes = new Set(guardados.map((g) => g.nombre));
  const llegan = new Set(delArchivo.map((g) => g.nombre));
  return {
    pisa: delArchivo.filter((g) => existentes.has(g.nombre)).map((g) => g.nombre),
    agrega: delArchivo.filter((g) => !existentes.has(g.nombre)).map((g) => g.nombre),
    intactos: guardados.filter((g) => !llegan.has(g.nombre)).map((g) => g.nombre),
  };
}

/**
 * ¿Hay bloques que quedan intactos MIENTRAS el archivo agrega otros? Es la
 * firma de un renombre, y el momento de mirar los nombres con atención.
 */
export function pareceRenombre(cambios: CambiosBloques): boolean {
  return cambios.intactos.length > 0 && cambios.agrega.length > 0;
}
