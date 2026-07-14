// Edición manual de la rutina: ajustar dosis, sustituir, quitar y agregar
// ejercicios día por día. Funciones puras e inmutables — sin DOM ni storage.

import type { Ejercicio, EjercicioRutina, Rutina, TipoEjercicio, UnidadEjercicio } from './tipos';

const SERIES_MIN = 1;
const SERIES_MAX = 6;
const DESCANSO_MAX_SEG = 600;

export interface CambioDosis {
  series?: number;
  repsMin?: number;
  repsMax?: number;
  descansoSeg?: number;
}

function acotar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function reemplazarEn(
  rutina: Rutina,
  diaIndex: number,
  transformar: (ejercicios: EjercicioRutina[]) => EjercicioRutina[],
): Rutina {
  const dia = rutina.dias[diaIndex];
  if (!dia) return rutina;
  const dias = [...rutina.dias];
  dias[diaIndex] = { ...dia, ejercicios: transformar(dia.ejercicios) };
  return { ...rutina, dias };
}

/** Ajusta series/rango/descanso de un ejercicio, con topes sanos. */
export function actualizarDosis(
  rutina: Rutina,
  diaIndex: number,
  idx: number,
  cambio: CambioDosis,
): Rutina {
  const actual = rutina.dias[diaIndex]?.ejercicios[idx];
  if (!actual) return rutina;
  const series = acotar(cambio.series ?? actual.series, SERIES_MIN, SERIES_MAX);
  const repsMin = Math.max(1, cambio.repsMin ?? actual.repsMin);
  const repsMax = Math.max(repsMin, cambio.repsMax ?? actual.repsMax);
  const descansoSeg = acotar(cambio.descansoSeg ?? actual.descansoSeg, 0, DESCANSO_MAX_SEG);
  return reemplazarEn(rutina, diaIndex, (ejercicios) =>
    ejercicios.map((e, i) => (i === idx ? { ...e, series, repsMin, repsMax, descansoSeg } : e)),
  );
}

/** Unidad que corresponde a un tipo cuando el ejercicio cambia de tipo. */
function unidadPara(tipo: TipoEjercicio): UnidadEjercicio | undefined {
  if (tipo === 'cardio') return 'min';
  if (tipo === 'elongacion') return 'seg';
  return undefined; // fuerza: default 'reps'
}

/**
 * Cambia el ejercicio manteniendo la dosis. Si el tipo cambia se ajusta la
 * unidad (reps/seg/min) y la zona de FC solo sobrevive entre cardios.
 */
export function sustituirEjercicio(
  rutina: Rutina,
  diaIndex: number,
  idx: number,
  nuevo: Ejercicio,
): Rutina {
  if (!rutina.dias[diaIndex]?.ejercicios[idx]) return rutina;
  return reemplazarEn(rutina, diaIndex, (ejercicios) =>
    ejercicios.map((e, i) => {
      if (i !== idx) return e;
      const unidad = nuevo.tipo === 'cardio' && e.unidad ? e.unidad : unidadPara(nuevo.tipo);
      const { unidad: _u, fcObjetivo: _fc, ...resto } = e;
      return {
        ...resto,
        ejercicioId: nuevo.id,
        movimiento: nuevo.movimiento,
        ...(unidad ? { unidad } : {}),
        ...(nuevo.tipo === 'cardio' && e.fcObjetivo ? { fcObjetivo: e.fcObjetivo } : {}),
      };
    }),
  );
}

/** Saca un ejercicio del día. */
export function quitarEjercicio(rutina: Rutina, diaIndex: number, idx: number): Rutina {
  if (!rutina.dias[diaIndex]?.ejercicios[idx]) return rutina;
  return reemplazarEn(rutina, diaIndex, (ejercicios) => ejercicios.filter((_, i) => i !== idx));
}

/** Dosis con la que arranca un ejercicio agregado a mano, según su tipo. */
export function dosisInicial(tipo: TipoEjercicio): Omit<EjercicioRutina, 'movimiento' | 'ejercicioId'> {
  if (tipo === 'cardio') return { series: 1, repsMin: 10, repsMax: 20, unidad: 'min', descansoSeg: 60 };
  if (tipo === 'elongacion') return { series: 1, repsMin: 20, repsMax: 30, unidad: 'seg', descansoSeg: 10 };
  return { series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 };
}

/** Agrega un ejercicio al final del día con la dosis inicial de su tipo. */
export function agregarEjercicio(rutina: Rutina, diaIndex: number, ejercicio: Ejercicio): Rutina {
  if (!rutina.dias[diaIndex]) return rutina;
  return reemplazarEn(rutina, diaIndex, (ejercicios) => [
    ...ejercicios,
    { movimiento: ejercicio.movimiento, ejercicioId: ejercicio.id, ...dosisInicial(ejercicio.tipo) },
  ]);
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Búsqueda para sustituir/agregar: por nombre (es/en) o músculo, sin
 * distinguir mayúsculas ni acentos. Los que empiezan con el texto van primero.
 */
export function buscarEjercicios(
  catalogo: Ejercicio[],
  texto: string,
  limite = 20,
): Ejercicio[] {
  const consulta = normalizar(texto.trim());
  if (consulta.length < 2) return [];
  const puntuados = catalogo
    .map((e) => {
      const nombre = normalizar(e.nombre_es);
      const campos = `${nombre} ${normalizar(e.nombre_en)} ${normalizar(e.musculo)}`;
      const puntaje = nombre.startsWith(consulta) ? 2 : campos.includes(consulta) ? 1 : 0;
      return { e, puntaje };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje);
  return puntuados.slice(0, limite).map((x) => x.e);
}
