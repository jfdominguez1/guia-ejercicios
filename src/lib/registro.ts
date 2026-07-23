// Registro de sesión de un tap: si registrar es caro, el usuario deja de
// hacerlo y la app muere. Nada acá es obligatorio salvo la fecha.

import type {
  Config,
  DiaRutina,
  Ejercicio,
  GrupoGuardado,
  Rutina,
  Sesion,
  TipoSesion,
} from './tipos';

export const CONFIG_DEFAULT: Config = { objetivoSemanal: 3, umbralPausaDias: 7, unidadEntrada: 'kg' };

const MS_POR_DIA = 86_400_000;
export const MAX_DIAS_RETRO = 7;

/**
 * Tipo de sesión según los ejercicios que la componen: gana el más frecuente.
 * Una sesión de elongación tiene que contar como elongación — si se asume
 * 'fuerza' para todo lo que no es cardio, el hábito que más cuesta sostener no
 * aparece en ninguna métrica.
 */
export function tipoPredominante(ejercicioIds: string[], catalogo: Ejercicio[]): TipoSesion {
  const conteo = new Map<string, number>();
  for (const id of ejercicioIds) {
    const tipo = catalogo.find((c) => c.id === id)?.tipo ?? 'fuerza';
    conteo.set(tipo, (conteo.get(tipo) ?? 0) + 1);
  }
  const [ganador] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['fuerza'];
  return ganador as TipoSesion;
}

/** Tipo predominante de un día planificado (para clasificar la sesión). */
function tipoDelDia(dia: DiaRutina, catalogo: Ejercicio[]): TipoSesion {
  return tipoPredominante(dia.ejercicios.map((e) => e.ejercicioId), catalogo);
}

/**
 * Repara el tipo de las sesiones ya guardadas que tienen detalle de ejercicios:
 * el wizard las marcaba todas 'fuerza', así que una elongación o un día de
 * cinta quedaron mal clasificados. Solo se tocan las que traen `items` (de las
 * otras el tipo ya se derivó bien del día). Devuelve el mismo array si no había
 * nada que corregir, para que el llamador sepa si hace falta persistir.
 */
export function corregirTipos(sesiones: Sesion[], catalogo: Ejercicio[]): Sesion[] {
  let huboCambio = false;
  const corregidas = sesiones.map((sesion) => {
    const hechos = (sesion.items ?? []).filter((i) => !i.salteado);
    if (hechos.length === 0) return sesion;
    const tipo = tipoPredominante(hechos.map((i) => i.ejercicioId), catalogo);
    if (tipo === sesion.tipo) return sesion;
    huboCambio = true;
    return { ...sesion, tipo };
  });
  return huboCambio ? corregidas : sesiones;
}

/** Cómo nombrar el tipo de sesión en un mensaje ("una sesión de elongación"). */
export const ETIQUETA_TIPO: Record<TipoSesion, string> = {
  fuerza: 'fuerza',
  cardio: 'cardio',
  elongacion: 'elongación',
  otro: 'otra actividad',
};

/** Botón grande "Hecha ✓": registra la sesión planificada con un tap. */
export function registrarHecha(
  rutina: Rutina,
  diaIndex: number,
  catalogo: Ejercicio[],
  fechaISO: string,
  rpe?: number,
): Sesion {
  const dia = rutina.dias[diaIndex];
  return {
    fecha: fechaISO,
    tipo: dia ? tipoDelDia(dia, catalogo) : 'fuerza',
    estado: 'hecha',
    diaIndex,
    ...(dia ? { diaRutina: dia.nombre } : {}),
    ...(rpe !== undefined ? { rpe } : {}),
  };
}

/** Ejecutar un bloque guardado: cuenta como sesión, no corre el ciclo de la rutina. */
export function registrarGrupo(
  grupo: GrupoGuardado,
  catalogo: Ejercicio[],
  fechaISO: string,
  rpe?: number,
): Sesion {
  return {
    fecha: fechaISO,
    tipo: tipoDelDia({ nombre: grupo.nombre, enfoque: '', ejercicios: grupo.ejercicios }, catalogo),
    estado: 'hecha',
    diaRutina: grupo.nombre,
    ...(rpe !== undefined ? { rpe } : {}),
  };
}

export type TipoRapido = 'caminata' | 'cinta' | 'fuerza' | 'elongacion' | 'otro';

/** "Hice otra cosa": dos taps (tipo + duración). Cuenta como sesión hecha. */
export function registrarOtra(
  tipo: TipoRapido,
  duracionMin: number,
  fechaISO: string,
): Sesion {
  const base = { fecha: fechaISO, estado: 'otra' as const, duracionMin };
  if (tipo === 'caminata' || tipo === 'cinta') {
    return { ...base, tipo: 'cardio', cardio: { tipo, minutos: duracionMin } };
  }
  return { ...base, tipo };
}

/** Registro retroactivo: hasta MAX_DIAS_RETRO días atrás, nunca a futuro. */
export function fechaValidaRetro(
  fechaISO: string,
  hoyISO: string,
  maxDias: number = MAX_DIAS_RETRO,
): boolean {
  const diff = Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / MS_POR_DIA);
  return diff >= 0 && diff <= maxDias;
}

/** Lunes de la semana de una fecha (semana lunes-domingo). */
export function lunesDe(fechaISO: string): number {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  const diaSemana = (fecha.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  return fecha.getTime() - diaSemana * MS_POR_DIA;
}

/**
 * EL número de la home: "Esta semana: X de Y". Cuenta días con actividad
 * (dos sesiones el mismo día = 1) — 'hecha' y 'otra' valen igual.
 */
export function resumenSemanal(
  sesiones: Sesion[],
  hoyISO: string,
  objetivo: number,
): { hechas: number; objetivo: number } {
  const inicio = lunesDe(hoyISO);
  const fin = inicio + 7 * MS_POR_DIA;
  const diasActivos = new Set(
    sesiones
      .filter((s) => {
        const t = Date.parse(`${s.fecha}T00:00:00Z`);
        return t >= inicio && t < fin;
      })
      .map((s) => s.fecha),
  );
  return { hechas: diasActivos.size, objetivo };
}

/**
 * Ejercicios que venís esquivando: aparecen salteados en la mayoría de las
 * últimas veces que los tuviste planificados. Señal para cambiarlos de la
 * rutina en vez de pelearlos cada sesión.
 */
export function ejerciciosEsquivados(
  sesiones: Sesion[],
  minVeces = 2,
): Array<{ ejercicioId: string; veces: number }> {
  const conteo = new Map<string, number>();
  for (const sesion of sesiones) {
    for (const item of sesion.items ?? []) {
      if (!item.salteado) continue;
      conteo.set(item.ejercicioId, (conteo.get(item.ejercicioId) ?? 0) + 1);
    }
  }
  return [...conteo.entries()]
    .filter(([, veces]) => veces >= minVeces)
    .map(([ejercicioId, veces]) => ({ ejercicioId, veces }))
    .sort((a, b) => b.veces - a.veces);
}

/**
 * ¿Ya hay una sesión de ese tipo registrada ese día? Tocar "Hecha ✓" dos veces
 * mete dos sesiones sin avisar e infla la métrica de la semana, que es EL
 * número de la home.
 */
export function yaHaySesion(sesiones: Sesion[], fecha: string, tipo: TipoSesion): boolean {
  return sesiones.some((s) => s.fecha === fecha && s.tipo === tipo);
}
