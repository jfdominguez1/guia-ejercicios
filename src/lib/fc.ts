// Zonas de frecuencia cardíaca personales (C1). El dato medido manda;
// sin dato, fallback 220 − edad. Nada por encima del 90% de la FC máx.

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

export function fcMaxEfectiva(perfil: Perfil): number {
  return perfil.fcMaxConocida ?? 220 - perfil.edad;
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
