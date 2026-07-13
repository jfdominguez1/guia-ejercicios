// "Hoy sin gym" (modo viaje, C3): convierte la sesión del día a variantes de
// cuerpo/banda. Override de ESE día — no cambia la rutina guardada ni el
// equipamiento del perfil. La sesión cuenta normal.

import type { DiaRutina, Ejercicio, EjercicioRutina, Perfil } from './tipos';

const GRUPOS_SIN_EQUIPO: Array<Ejercicio['grupo']> = ['cuerpo', 'banda'];
const EDAD_SIN_IMPACTO = 50;

/** Regla A3: nada de cardio de impacto para nivel empiezo con 50+. */
function permitido(candidato: Ejercicio, perfil: Perfil): boolean {
  const filtrarImpacto = perfil.nivel === 'empiezo' && perfil.edad >= EDAD_SIN_IMPACTO;
  return !(filtrarImpacto && candidato.tipo === 'cardio' && candidato.impacto);
}

export interface DiaSinGym {
  dia: DiaRutina;
  /** Ejercicios sin equivalente sin equipo, omitidos por hoy. */
  avisos: string[];
}

/**
 * Para cada ejercicio: variante del mismo movimiento en cuerpo/banda →
 * si no hay, otro ejercicio del mismo músculo → si tampoco, se omite con
 * aviso. Mantiene series/reps/unidad/fcObjetivo/descanso tal cual.
 */
export function convertirDiaSinGym(
  dia: DiaRutina,
  catalogo: Ejercicio[],
  customs: Ejercicio[],
  perfil: Perfil,
): DiaSinGym {
  const porId = new Map([...catalogo, ...customs].map((e) => [e.id, e]));
  // customs primero: si el usuario ya tiene su versión sin equipo, gana
  const pool = [...customs, ...catalogo].filter((e) => GRUPOS_SIN_EQUIPO.includes(e.grupo));

  const usados = new Set<string>();
  for (const e of dia.ejercicios) {
    const info = porId.get(e.ejercicioId);
    if (info && GRUPOS_SIN_EQUIPO.includes(info.grupo)) usados.add(info.id);
  }

  const ejercicios: EjercicioRutina[] = [];
  const avisos: string[] = [];
  for (const e of dia.ejercicios) {
    const info = porId.get(e.ejercicioId);
    if (!info || GRUPOS_SIN_EQUIPO.includes(info.grupo)) {
      ejercicios.push(e); // ya es sin equipo (o desconocido: no se toca)
      continue;
    }
    const candidatos = pool.filter(
      (c) => c.tipo === info.tipo && !usados.has(c.id) && permitido(c, perfil),
    );
    const reemplazo =
      candidatos.find((c) => c.movimiento === info.movimiento) ??
      candidatos.find((c) => c.musculo === info.musculo);
    if (!reemplazo) {
      avisos.push(`«${info.nombre_es}» sin equivalente sin equipo — omitido por hoy.`);
      continue;
    }
    usados.add(reemplazo.id);
    ejercicios.push({ ...e, ejercicioId: reemplazo.id, movimiento: reemplazo.movimiento });
  }

  return { dia: { ...dia, ejercicios }, avisos };
}
