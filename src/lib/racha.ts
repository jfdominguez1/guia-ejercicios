// Racha y contexto de la home. Lo que hace que la pantalla de inicio diga algo
// más que "0 de 3": cuántas semanas seguidas venís cumpliendo, hace cuánto que
// no entrenás y una frase que cambie según eso.
// Funciones puras — sin DOM ni storage.

import { lunesDe } from './registro';
import type { Sesion } from './tipos';

const MS_POR_DIA = 86_400_000;

export interface EstadoRacha {
  /** Semanas seguidas en las que llegaste al objetivo (la actual cuenta solo si ya la cumpliste). */
  semanas: number;
  /** Días desde la última sesión. null si todavía no hay ninguna. */
  diasSinEntrenar: number | null;
  /** Días distintos con actividad, de toda la historia. */
  totalDias: number;
}

/** Días distintos con actividad, ordenados del más viejo al más nuevo. */
function diasActivos(sesiones: Sesion[]): string[] {
  return [...new Set(sesiones.map((s) => s.fecha))].sort();
}

/**
 * Semanas seguidas cumplidas, contando hacia atrás desde la de hoy.
 *
 * La semana en curso solo suma si YA llegaste al objetivo: si contara siempre,
 * la racha se caería a 0 todos los lunes a la mañana, que es justo el momento
 * en que menos ayuda ver un cero.
 */
function semanasSeguidas(dias: string[], hoy: string, objetivo: number): number {
  if (objetivo <= 0) return 0;
  const porSemana = new Map<number, number>();
  for (const dia of dias) porSemana.set(lunesDe(dia), (porSemana.get(lunesDe(dia)) ?? 0) + 1);

  let semana = lunesDe(hoy);
  let racha = 0;
  // La semana en curso incompleta no rompe la racha: se saltea y se sigue atrás.
  if ((porSemana.get(semana) ?? 0) >= objetivo) racha++;
  semana -= 7 * MS_POR_DIA;
  while ((porSemana.get(semana) ?? 0) >= objetivo) {
    racha++;
    semana -= 7 * MS_POR_DIA;
  }
  return racha;
}

export function calcularRacha(sesiones: Sesion[], hoy: string, objetivo: number): EstadoRacha {
  const dias = diasActivos(sesiones);
  const ultima = dias[dias.length - 1];
  return {
    semanas: semanasSeguidas(dias, hoy, objetivo),
    diasSinEntrenar: ultima
      ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(ultima)) / MS_POR_DIA))
      : null,
    totalDias: dias.length,
  };
}

/**
 * La línea de contexto de la home. Nunca culpa: si venís flojo, el texto
 * empuja hacia adelante en vez de marcar lo que faltó.
 */
export function fraseRacha(estado: EstadoRacha, hechas: number, objetivo: number): string {
  if (estado.totalDias === 0) return 'Tu primera sesión arranca acá.';
  if (estado.diasSinEntrenar === 0) return 'Ya entrenaste hoy. Bien ahí.';
  if (estado.semanas >= 2) return `${estado.semanas} semanas seguidas cumpliendo.`;
  if (hechas >= objetivo) return 'Semana cumplida. Lo que venga es extra.';
  const faltan = objetivo - hechas;
  if (hechas > 0) return `${faltan} ${faltan === 1 ? 'sesión' : 'sesiones'} para cerrar la semana.`;
  if ((estado.diasSinEntrenar ?? 0) >= 7) return 'Volver es la parte difícil. Hoy alcanza con empezar.';
  return 'Arrancá la semana con una.';
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "Lunes 20 de julio" — se arma a mano para no depender del locale del teléfono. */
export function fechaLarga(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return `${DIAS[fecha.getUTCDay()]} ${dia} de ${MESES[mes - 1]}`;
}
