// La rutina en texto legible por una persona: para mandársela a alguien
// (entrenador, amigo) o tenerla a mano en un chat. Nada que ver con el export
// para la IA (que es el pedido completo, largo, con catálogo y reglas) ni con
// el respaldo (que es el JSON crudo para restaurar).
// Funciones puras — sin DOM ni storage.

import { formatearObjetivo, formatearFc, etiquetaDescanso } from './formato';
import type { Ejercicio, EjercicioRutina, Rutina } from './tipos';

/** "Press banca — 3× 8-12 reps · descanso 90s" */
export function lineaEjercicio(ejercicio: EjercicioRutina, catalogo: Ejercicio[]): string {
  const info = catalogo.find((e) => e.id === ejercicio.ejercicioId);
  const tipo = info?.tipo ?? 'fuerza';
  // Sin nombre en el catálogo (custom borrado, id viejo) el id es mejor que nada.
  const nombre = info?.nombre_es ?? ejercicio.ejercicioId;
  const partes = [
    `${ejercicio.series}× ${formatearObjetivo(ejercicio, tipo)}`,
    `${etiquetaDescanso(ejercicio, tipo)} ${ejercicio.descansoSeg}s`,
  ];
  const fc = formatearFc(ejercicio);
  if (fc) partes.push(fc);
  return `• ${nombre} — ${partes.join(' · ')}`;
}

/** Un día completo, con su encabezado. */
export function textoDia(rutina: Rutina, dia: number, catalogo: Ejercicio[]): string {
  const d = rutina.dias[dia];
  if (!d) return '';
  const titulo = d.enfoque && d.enfoque !== d.nombre ? `${d.nombre} · ${d.enfoque}` : d.nombre;
  const cuerpo = d.ejercicios.length
    ? d.ejercicios.map((e) => lineaEjercicio(e, catalogo)).join('\n')
    : '• (descanso)';
  return `${titulo}\n${cuerpo}`;
}

/**
 * Toda la rutina, lista para pegar en un chat. Texto plano a propósito: los
 * asteriscos de markdown se ven como asteriscos en la mayoría de los lugares
 * donde va a terminar esto.
 */
export function textoRutina(rutina: Rutina, catalogo: Ejercicio[]): string {
  const dias = rutina.dias.length;
  const encabezado = `💪 Mi rutina — ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const cuerpo = rutina.dias.map((_, i) => textoDia(rutina, i, catalogo)).join('\n\n');
  return `${encabezado}\n\n${cuerpo}`;
}
