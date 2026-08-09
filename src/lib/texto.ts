// Topes de los campos de texto libre y el aviso que los hace visibles.
//
// El 09/08 JFD usó el campo de sensación del cardio para reportar un bug y el
// navegador se lo cortó en 80 caracteres a mitad de palabra, sin decir nada:
// quedó "Cuandolo puse como ejercicio del dia hoce bic". Un tope invisible en
// un campo dictado por voz —donde nadie cuenta caracteres— se come justo la
// parte que importa. Si hay tope, se ve.

/** Tope de los campos de texto libre (sensación, notas, nota por ejercicio). */
export const TOPE_TEXTO = 500;

/** A partir de acá el contador aparece. Antes solo sería ruido. */
const MARGEN_AVISO = 60;

/**
 * Qué mostrar debajo de un campo de texto: nada mientras sobre lugar, el
 * conteo cuando se acerca al tope, y un aviso claro cuando lo tocó.
 */
export function avisoRestante(largo: number, tope: number = TOPE_TEXTO): string | null {
  const quedan = tope - largo;
  if (quedan > MARGEN_AVISO) return null;
  if (quedan === 1) return 'Queda 1 caracter';
  if (quedan > 0) return `Quedan ${quedan} caracteres`;
  return `Llegaste al máximo de ${tope} caracteres`;
}
