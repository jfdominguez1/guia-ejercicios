// Carriles por tipo: el home deja de decir "hoy te toca X" y ofrece Fuerza,
// Cardio y Elongación, cada uno con su propia rotación y su propia deuda.
//
// Por qué existe:
//
// 1. La rotación global estaba rota. `resolverSalteo` solo mira sesiones de
//    tipo 'fuerza', y la rutina tiene 5 días de los cuales 2 son de fuerza:
//    hacer cardio o elongación no la avanzaba NUNCA, así que la app repetía el
//    mismo día. Acá la rotación es por carril, así que cada tipo avanza con lo
//    suyo y el problema no puede volver.
//
// 2. La meta única de 3 días con actividad mostraba verde cinco semanas
//    seguidas mientras el desbalance entre cardio y elongación era de 8 a 1.
//    Una métrica que suma peras con manzanas no puede mostrar el hueco. La meta
//    por tipo (2 · 2 · 2) no es más exigente: ratifica dos casilleros que ya se
//    cumplen y le pone nombre al que falta.

import { lunesDe } from './registro';
import type { Config, DiaRutina, Ejercicio, Rutina, Sesion, TipoSesion } from './tipos';

/** Los tres carriles. 'otro' no es un carril: no hay días de rutina de eso. */
export type Carril = 'fuerza' | 'cardio' | 'elongacion';

export const CARRILES: Carril[] = ['fuerza', 'cardio', 'elongacion'];

export const NOMBRE_CARRIL: Record<Carril, string> = {
  fuerza: 'Fuerza',
  cardio: 'Cardio',
  elongacion: 'Elongación',
};

/**
 * Meta por defecto: 2 · 2 · 3.
 *
 * La elongación va en 3 y no en 2 por decisión de JFD (09/08), junto con la
 * rutina v10: con tres días de elongación rotando, el más difícil —cadera y
 * piernas— le toca una de cada tres veces en vez de una de cada dos.
 */
export const META_DEFAULT: Record<Carril, number> = { fuerza: 2, cardio: 2, elongacion: 3 };

const MS_POR_DIA = 86_400_000;

/**
 * A qué carril pertenece un día de la rutina.
 *
 * Jerarquía y no "el tipo más frecuente": un día de 45 min de cinta con cuatro
 * estiramientos de cola es un día de CARDIO, aunque haya cuatro elongaciones y
 * un solo cardio. La elongación siempre acompaña; nunca define el día.
 */
export function carrilDelDia(dia: DiaRutina, catalogo: Ejercicio[]): Carril {
  const tipos = new Set(
    dia.ejercicios.map((e) => catalogo.find((c) => c.id === e.ejercicioId)?.tipo ?? 'fuerza'),
  );
  if (tipos.has('fuerza')) return 'fuerza';
  if (tipos.has('cardio')) return 'cardio';
  return 'elongacion';
}

/**
 * ¿La sesión cuenta para la meta? Una con TODOS los ejercicios salteados no:
 * el 08/08 quedó registrada una sesión de elongación con los 4 estiramientos
 * salteados. Pintar ese casillero de verde sería mentir.
 */
export function sesionCuenta(sesion: Sesion): boolean {
  const items = sesion.items ?? [];
  if (items.length === 0) return true; // "Hecha ✓" y registros rápidos: sin detalle, valen
  return items.some((i) => !i.salteado);
}

/** Sesiones de un tipo que cuentan, ordenadas por fecha. */
function sesionesDe(sesiones: Sesion[], carril: Carril): Sesion[] {
  return sesiones
    .filter((s) => s.tipo === (carril as TipoSesion) && sesionCuenta(s))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface DiaDeCarril {
  diaIndex: number;
  nombre: string;
}

export interface EstadoCarril {
  carril: Carril;
  /** Días de la rutina de este carril, en el orden en que están en la rutina. */
  dias: DiaDeCarril[];
  /** El que toca ahora dentro del carril. Undefined si la rutina no tiene días de este tipo. */
  proximo?: DiaDeCarril;
  /** Días desde la última sesión que contó. Undefined = nunca se hizo. */
  diasDesde?: number;
  /** Sesiones de este tipo esta semana (lunes a domingo). */
  hechas: number;
  meta: number;
}

/** Lo que falta para la meta. Nunca negativo: pasarse no genera crédito. */
export function deuda(estado: EstadoCarril): number {
  return Math.max(0, estado.meta - estado.hechas);
}

/**
 * El día que toca dentro de un carril: el siguiente al último que se hizo DE
 * ESE CARRIL. Cada carril avanza con lo suyo — es todo el arreglo de la
 * rotación.
 */
export function proximoDelCarril(
  dias: DiaDeCarril[],
  sesiones: Sesion[],
  carril: Carril,
): DiaDeCarril | undefined {
  if (dias.length === 0) return undefined;
  const previas = sesionesDe(sesiones, carril).filter((s) => s.diaIndex !== undefined);
  const ultima = previas[previas.length - 1];
  if (!ultima) return dias[0];
  const posicion = dias.findIndex((d) => d.diaIndex === ultima.diaIndex);
  // Si el último día ya no está en la rutina (se editó), se arranca de nuevo.
  if (posicion === -1) return dias[0];
  return dias[(posicion + 1) % dias.length];
}

/** Meta configurada, con la de fábrica como respaldo. */
export function metasDe(config: Config): Record<Carril, number> {
  return { ...META_DEFAULT, ...(config.metaSemanal ?? {}) };
}

/**
 * Estado de los tres carriles, **ordenados por deuda**: el más atrasado arriba.
 * Desempate por hace-cuánto (lo que hace más que no hacés, primero), y a igual
 * todo, el orden de siempre. Un carril sin días en la rutina va al final: no se
 * le puede pedir nada.
 */
export function estadoCarriles(
  rutina: Rutina | null,
  sesiones: Sesion[],
  catalogo: Ejercicio[],
  hoyISO: string,
  config: Config,
): EstadoCarril[] {
  const metas = metasDe(config);
  const inicioSemana = lunesDe(hoyISO);
  const finSemana = inicioSemana + 7 * MS_POR_DIA;

  const estados = CARRILES.map((carril): EstadoCarril => {
    const dias = (rutina?.dias ?? [])
      .map((dia, diaIndex) => ({ dia, diaIndex }))
      // Un día sin ejercicios no se puede ofrecer: el wizard abriría una
      // pantalla vacía. Además `carrilDelDia` lo mandaba a elongación por
      // descarte (sin tipos que mirar), donde encima ganaba por deuda.
      .filter(({ dia }) => dia.ejercicios.length > 0)
      .filter(({ dia }) => carrilDelDia(dia, catalogo) === carril)
      .map(({ dia, diaIndex }) => ({ diaIndex, nombre: dia.nombre }));

    const previas = sesionesDe(sesiones, carril);
    const ultima = previas[previas.length - 1];
    const hechas = previas.filter((s) => {
      const t = Date.parse(`${s.fecha}T00:00:00Z`);
      return t >= inicioSemana && t < finSemana;
    }).length;

    return {
      carril,
      dias,
      ...(proximoDelCarril(dias, sesiones, carril) ? { proximo: proximoDelCarril(dias, sesiones, carril) } : {}),
      ...(ultima ? { diasDesde: Math.round((Date.parse(hoyISO) - Date.parse(ultima.fecha)) / MS_POR_DIA) } : {}),
      hechas,
      meta: metas[carril],
    };
  });

  const ordenBase = (c: Carril) => CARRILES.indexOf(c);
  return [...estados].sort((a, b) => {
    // Sin días en la rutina: al final, aunque deba.
    if ((a.dias.length === 0) !== (b.dias.length === 0)) return a.dias.length === 0 ? 1 : -1;
    if (deuda(a) !== deuda(b)) return deuda(b) - deuda(a);
    // Nunca hecho pesa más que hecho hace mucho.
    const espera = (e: EstadoCarril) => e.diasDesde ?? Number.MAX_SAFE_INTEGER;
    if (espera(a) !== espera(b)) return espera(b) - espera(a);
    return ordenBase(a.carril) - ordenBase(b.carril);
  });
}

/** "hace 3 días" / "hoy" / "todavía no". Sin números crudos en pantalla. */
export function textoUltimaVez(estado: EstadoCarril): string {
  if (estado.diasDesde === undefined) return 'todavía no';
  if (estado.diasDesde <= 0) return 'hoy';
  if (estado.diasDesde === 1) return 'ayer';
  return `hace ${estado.diasDesde} días`;
}

/**
 * El resumen de la semana, en una línea. Se nombra lo que falta sin reprochar
 * nada: "te faltan 2 de elongación" y no "no hiciste elongación".
 */
export function resumenSemana(estados: EstadoCarril[]): string {
  const faltan = estados.filter((e) => deuda(e) > 0 && e.dias.length > 0);
  if (faltan.length === 0) return 'Semana completa 💪';
  const partes = faltan.map((e) => `${deuda(e)} de ${NOMBRE_CARRIL[e.carril].toLowerCase()}`);
  if (partes.length === 1) return `Te falta ${partes[0]}`;
  return `Te faltan ${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
