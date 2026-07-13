// Botón "Retomar" (anti-abandono): el momento más peligroso no es faltar un
// día, es el día que hay que volver. Cero culpa: la app nunca compara contra
// el pasado en tono de pérdida — solo mira hacia adelante.

import { unidadEfectiva } from './formato';
import { resolverSalteo, type ResultadoSalteo } from './motor';
import type { Config, DiaRutina, Ejercicio, EjercicioRutina, GrupoEquip, Rutina, Sesion, TipoEjercicio } from './tipos';

const MS_POR_DIA = 86_400_000;
const PAUSA_CORTA_MAX = 14;
const PAUSA_MEDIA_MAX = 30;
const FACTOR_CARDIO = 0.6;
const FACTOR_PESO = 0.8;
const SERIES_REDUCIDAS_FUERZA = 2;

export type NivelPausa = 'ninguna' | 'corta' | 'media' | 'larga';

export interface Pausa {
  enPausa: boolean;
  dias: number;
  nivel: NivelPausa;
}

/** Días desde la última sesión de CUALQUIER tipo. Sin sesiones = empezar, no retomar. */
export function detectarPausa(sesiones: Sesion[], hoyISO: string, umbralDias: number): Pausa {
  if (sesiones.length === 0) return { enPausa: false, dias: 0, nivel: 'ninguna' };
  const ultima = sesiones.reduce((max, s) => (s.fecha > max ? s.fecha : max), sesiones[0]!.fecha);
  const dias = Math.round((Date.parse(hoyISO) - Date.parse(ultima)) / MS_POR_DIA);
  if (dias < umbralDias) return { enPausa: false, dias, nivel: 'ninguna' };
  const nivel: NivelPausa =
    dias <= PAUSA_CORTA_MAX ? 'corta' : dias <= PAUSA_MEDIA_MAX ? 'media' : 'larga';
  return { enPausa: true, dias, nivel };
}

export interface PeriodoPausa {
  desde: string;
  hasta: string;
  dias: number;
}

/** Huecos históricos >= umbral entre sesiones consecutivas (para el export IA). */
export function detectarPausas(sesiones: Sesion[], umbralDias: number): PeriodoPausa[] {
  const fechas = [...new Set(sesiones.map((s) => s.fecha))].sort();
  const pausas: PeriodoPausa[] = [];
  for (let i = 1; i < fechas.length; i++) {
    const dias = Math.round((Date.parse(fechas[i]!) - Date.parse(fechas[i - 1]!)) / MS_POR_DIA);
    if (dias >= umbralDias) {
      pausas.push({ desde: fechas[i - 1]!, hasta: fechas[i]!, dias });
    }
  }
  return pausas;
}

function tipoDe(ejercicio: EjercicioRutina, catalogo: Ejercicio[]): TipoEjercicio {
  const enCatalogo = catalogo.find((c) => c.id === ejercicio.ejercicioId)?.tipo;
  if (enCatalogo) return enCatalogo;
  const unidad = ejercicio.unidad;
  return unidad === 'min' ? 'cardio' : unidad === 'seg' ? 'elongacion' : 'fuerza';
}

/**
 * Versión reducida de un día: fuerza a 2 series, cardio al 60% (bloques o
 * minutos), elongación igual. Sin marcar como "light" — hecha es hecha.
 */
export function reducirDia(dia: DiaRutina, catalogo: Ejercicio[]): DiaRutina {
  return {
    ...dia,
    ejercicios: dia.ejercicios.map((e) => {
      const tipo = tipoDe(e, catalogo);
      if (tipo === 'elongacion') return e;
      if (tipo === 'cardio' || unidadEfectiva(e, tipo) === 'min') {
        if (e.series > 1) {
          return { ...e, series: Math.max(1, Math.ceil(e.series * FACTOR_CARDIO)) };
        }
        return {
          ...e,
          repsMin: Math.max(1, Math.ceil(e.repsMin * FACTOR_CARDIO)),
          repsMax: Math.max(1, Math.ceil(e.repsMax * FACTOR_CARDIO)),
        };
      }
      return { ...e, series: Math.min(e.series, SERIES_REDUCIDAS_FUERZA) };
    }),
  };
}

export function reducirRutina(rutina: Rutina, catalogo: Ejercicio[]): Rutina {
  return { ...rutina, dias: rutina.dias.map((d) => reducirDia(d, catalogo)) };
}

/** Peso sugerido al retomar: 20% menos que el último registrado (a 0.5 kg). */
export function pesoSugeridoRetomar(
  sesiones: Sesion[],
  ejercicioId: string,
  variante: GrupoEquip,
): number | null {
  const ordenadas = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const sesion of ordenadas) {
    const item = sesion.items?.find((i) => i.ejercicioId === ejercicioId && i.variante === variante);
    const conPeso = item?.series.filter((s) => s.pesoKg !== undefined) ?? [];
    const ultimo = conPeso[conPeso.length - 1]?.pesoKg;
    if (ultimo !== undefined) return Math.round(ultimo * FACTOR_PESO * 2) / 2;
  }
  return null;
}

export interface ResultadoRetomar {
  modo: 'normal' | 'retomar';
  nivel?: NivelPausa;
  /** Copy sin culpa: nunca menciona días perdidos ni números en rojo. */
  mensaje?: string;
  /** Próximo día de la rutina en versión corta (pausa corta y media). */
  sesionReducida?: DiaRutina;
  /** Pausa media: toda la primera semana va reducida. */
  semanaReducida?: boolean;
  /** Pausa larga: sugerir regenerar la rutina con la IA (export actualizado). */
  sugerirIA?: boolean;
}

const MENSAJE_RETOMAR = 'La sesión de hoy vale por haber ido. Versión corta lista.';
const MENSAJE_IA =
  'Para volver bien, lo mejor es regenerar la rutina con tu IA usando el export actualizado. Mientras tanto, tenés una versión corta lista.';

/** Escalado por duración de pausa (regla 7-14 / 14-30 / +30 días). */
export function resolverRetomar(
  rutina: Rutina,
  sesiones: Sesion[],
  hoyISO: string,
  config: Config,
  catalogo: Ejercicio[],
): ResultadoRetomar {
  const pausa = detectarPausa(sesiones, hoyISO, config.umbralPausaDias);
  if (!pausa.enPausa) return { modo: 'normal' };

  // tras una pausa se arranca la semana de nuevo (coincide con el reset del salteo)
  const primerDia = rutina.dias[0];
  return {
    modo: 'retomar',
    nivel: pausa.nivel,
    mensaje: pausa.nivel === 'larga' ? MENSAJE_IA : MENSAJE_RETOMAR,
    ...(primerDia ? { sesionReducida: reducirDia(primerDia, catalogo) } : {}),
    semanaReducida: pausa.nivel === 'media',
    sugerirIA: pausa.nivel === 'larga',
  };
}

export interface EstadoHome {
  modo: 'normal' | 'retomar';
  /** Solo en modo retomar: la home muestra ÚNICAMENTE esto. */
  retomar?: ResultadoRetomar;
  /** Solo en modo normal: qué toca hoy (banner de salteo incluido). */
  salteo?: ResultadoSalteo;
}

/**
 * Precedencia de la home (C4): si hay pausa activa, el modo retomar es lo
 * único en pantalla — el banner de salteo no se muestra.
 */
export function estadoHome(
  rutina: Rutina,
  sesiones: Sesion[],
  hoyISO: string,
  config: Config,
  catalogo: Ejercicio[],
): EstadoHome {
  const retomar = resolverRetomar(rutina, sesiones, hoyISO, config, catalogo);
  if (retomar.modo === 'retomar') return { modo: 'retomar', retomar };
  return { modo: 'normal', salteo: resolverSalteo(rutina, sesiones, hoyISO) };
}
