// Peso en kg y libras. El dato SIEMPRE se guarda en kg: la libra es una
// segunda lectura para las máquinas rotuladas en lb, nunca un formato de
// guardado. Funciones puras.

import type { SerieHecha, UnidadPeso } from './tipos';

export type { UnidadPeso };

const LB_POR_KG = 2.20462262;

/** Paso natural de cada unidad: los discos van de a 2,5 kg y las placas de a 5 lb. */
export const PASO: Record<UnidadPeso, number> = { kg: 2.5, lb: 5 };

/**
 * Siguiente "muesca" en la dirección pedida. No es sumar el paso y redondear:
 * desde 44 lb subir tiene que dar 45 (la placa siguiente), no 50.
 */
function siguienteMuesca(valor: number, paso: number, signo: 1 | -1): number {
  return signo === 1
    ? Math.floor(valor / paso + 1) * paso
    : Math.ceil(valor / paso - 1) * paso;
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/**
 * El kg guardado lleva 2 decimales y la libra mostrada 1. No es capricho: si
 * el kg se redondeara a 0,5 (que parece "lo natural en un gimnasio"), tipear
 * 50 lb guardaría 22,5 kg y al volver a mostrarlo darían 49,5 lb. El peso se
 * movería solo cada vez que abrís la pantalla.
 */
export function kgALb(kg: number): number {
  return redondear(kg * LB_POR_KG, 1);
}

export function lbAKg(lb: number): number {
  return redondear(lb / LB_POR_KG, 2);
}

/** Convierte a kg lo que el usuario tipeó en la unidad que tenga activa. */
export function aKg(valor: number, unidad: UnidadPeso): number {
  return unidad === 'kg' ? redondear(valor, 2) : lbAKg(valor);
}

/** Pasa de kg a la unidad de entrada, para precargar el input sin sorpresas. */
export function desdeKg(kg: number, unidad: UnidadPeso): number {
  return unidad === 'kg' ? redondear(kg, 2) : kgALb(kg);
}

function limpiar(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(redondear(valor, 1)).replace('.', ',');
}

/**
 * Las dos lecturas juntas: "20 kg · 44 lb". Es lo que se muestra como
 * referencia para encontrar el valor en una máquina rotulada en libras.
 */
export function formatearPeso(kg: number): string {
  return `${limpiar(kg)} kg · ${limpiar(kgALb(kg))} lb`;
}

/** El equivalente en la otra unidad, para el hint al lado del input. */
export function equivalente(valor: number, unidad: UnidadPeso): string {
  if (!Number.isFinite(valor) || valor <= 0) return '';
  return unidad === 'kg' ? `${limpiar(kgALb(valor))} lb` : `${limpiar(lbAKg(valor))} kg`;
}

/** Sube o baja un peso por el paso de su unidad, sin bajar de cero. */
export function ajustarPeso(kg: number | undefined, unidad: UnidadPeso, signo: 1 | -1): number {
  const enUnidad = desdeKg(kg ?? 0, unidad);
  const siguiente = siguienteMuesca(enUnidad, PASO[unidad], signo);
  return aKg(Math.max(0, siguiente), unidad);
}

/**
 * Resumen de lo que hiciste la última vez, con las dos unidades.
 * Ej: "3×10 · 20 kg · 44 lb". Vacío si no hay series.
 */
export function resumenSeries(series: SerieHecha[]): string {
  if (!series.length) return '';
  const reps = series.map((s) => s.reps);
  const todasIguales = reps.every((r) => r === reps[0]);
  const parteReps = todasIguales ? `${series.length}×${reps[0]}` : reps.join('/');
  const pesos = series.map((s) => s.pesoKg).filter((p): p is number => p !== undefined);
  if (!pesos.length) return parteReps;
  const max = Math.max(...pesos);
  const min = Math.min(...pesos);
  const parsePeso = min === max ? formatearPeso(max) : `${limpiar(min)}–${formatearPeso(max)}`;
  return `${parteReps} · ${parsePeso}`;
}
