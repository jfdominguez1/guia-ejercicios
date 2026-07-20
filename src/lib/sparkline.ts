// Mini-gráfico de línea en SVG, sin librería: la CSP de la PWA y el modo
// offline no toleran un CDN, y traer Chart.js serían 200 KB para una lucecita.
// Función pura: dado N valores devuelve la geometría del path; el color y el
// tema los pone el SVG con currentColor. Testeable sin pixeles.

export interface Sparkline {
  /** El atributo `d` de un <path>. Vacío si no hay suficientes puntos. */
  d: string;
  /** Coordenadas del último punto, para marcarlo con un círculo. null si no hay. */
  ultimo: { x: number; y: number } | null;
  ancho: number;
  alto: number;
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Mapea los valores a una polilínea dentro de `ancho`×`alto` (con `pad` de
 * margen). El eje Y se invierte (más valor = más arriba). Una serie plana se
 * dibuja en el medio, no pegada al piso.
 */
export function sparkline(valores: number[], ancho = 240, alto = 48, pad = 5): Sparkline {
  const base: Sparkline = { d: '', ultimo: null, ancho, alto };
  if (valores.length < 2) return base;

  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min;
  const anchoUtil = ancho - 2 * pad;
  const altoUtil = alto - 2 * pad;

  const puntos = valores.map((v, i) => {
    const x = pad + (anchoUtil * i) / (valores.length - 1);
    // Serie plana (rango 0): línea en el medio.
    const factor = rango === 0 ? 0.5 : (v - min) / rango;
    const y = alto - pad - altoUtil * factor;
    return { x: r(x), y: r(y) };
  });

  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return { d, ultimo: puntos[puntos.length - 1]!, ancho, alto };
}
