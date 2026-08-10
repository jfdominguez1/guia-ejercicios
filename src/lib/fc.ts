// Zonas de frecuencia cardíaca personales (C1). El dato medido manda;
// sin dato, se estima con Tanaka. Nada por encima del 90% de la FC máx.

import type { Perfil } from './tipos';

export interface ZonaFc {
  nombre: string;
  min: number;
  max: number;
}

// límites como % de la FC máxima
const ZONAS_PCT: Array<{ nombre: string; desde: number; hasta: number }> = [
  { nombre: 'Recuperación', desde: 0, hasta: 0.61 },
  { nombre: 'Zona 2', desde: 0.61, hasta: 0.73 },
  { nombre: 'Tempo', desde: 0.73, hasta: 0.81 },
  { nombre: 'Fuerte', desde: 0.81, hasta: 0.9 },
];

/**
 * FC máxima estimada por la fórmula de Tanaka (2001): 208 − 0,7 × edad.
 *
 * Reemplaza a "220 − edad", que se usaba antes acá. Esa no sale de ningún
 * estudio: es una simplificación de los años 70 que **subestima la máxima en
 * mayores de 40** — justo el caso de este perfil. Tanaka sale de un
 * meta-análisis de 351 estudios y es la referencia habitual hoy.
 *
 * La diferencia no es cosmética: a los 60 da 166 en vez de 160, y como TODAS
 * las zonas son un porcentaje de este número, seis ppm corren los cuatro
 * rangos. Con la vieja, un cardio "en zona 2" quedaba pedido más suave de lo
 * que corresponde.
 *
 * Sigue siendo una estimación: si algún día se mide de verdad (con la banda),
 * `fcMaxConocida` le gana siempre y esto no se usa.
 */
export function fcMaxEstimada(edad: number): number {
  return Math.round(208 - 0.7 * edad);
}

export function fcMaxEfectiva(perfil: Perfil): number {
  return perfil.fcMaxConocida ?? fcMaxEstimada(perfil.edad);
}

/** Las 4 zonas en ppm derivadas del perfil. */
export function zonasFc(perfil: Perfil): ZonaFc[] {
  const fcMax = fcMaxEfectiva(perfil);
  return ZONAS_PCT.map((z) => ({
    nombre: z.nombre,
    min: Math.round(fcMax * z.desde),
    max: Math.round(fcMax * z.hasta),
  }));
}

/** Zona a la que corresponde una FC, o null si supera el 90% de la máx. */
export function zonaDe(fcPpm: number, perfil: Perfil): ZonaFc | null {
  return zonasFc(perfil).find((z) => fcPpm >= z.min && fcPpm < z.max) ?? null;
}
