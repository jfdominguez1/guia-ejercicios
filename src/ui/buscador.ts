// Buscador de ejercicios reutilizable. Existía copiado en la pantalla Rutina,
// en el wizard y (con otra forma) en el catálogo, cada uno con su propio
// markup y su propio manejo del foco. Acá vive una sola vez.

import { buscarEjercicios } from '../lib/editor';
import { escapar } from './datos';
import type { Ejercicio } from '../lib/tipos';

const LABEL_GRUPO: Record<string, string> = {
  pesas: 'Pesas', maquina: 'Máquina', banda: 'Banda', cuerpo: 'Cuerpo', pelota: 'Pelota', rodillo: 'Rodillo',
};

export function etiquetaGrupo(grupo: string): string {
  return LABEL_GRUPO[grupo] ?? grupo;
}

/** Markup de una lista de ejercicios elegibles. Compartido por buscador y sugerencias. */
export function htmlOpciones(lista: Ejercicio[]): string {
  return lista
    .map(
      (e) => `<button type="button" class="opcion-ej" data-elegir="${escapar(e.id)}">
        <strong>${escapar(e.nombre_es)}</strong>
        <span class="ayuda">${escapar(e.musculo)} · ${escapar(etiquetaGrupo(e.grupo))}</span>
      </button>`,
    )
    .join('');
}

export interface OpcionesBuscador {
  catalogo: Ejercicio[];
  alElegir: (ejercicio: Ejercicio) => void;
  etiqueta?: string;
  placeholder?: string;
  limite?: number;
  /** Qué mostrar cuando el campo está vacío (equivalentes, sugerencias, etc.). */
  htmlInicial?: () => string;
}

/**
 * Crea el buscador como un elemento suelto: solo se repinta la lista de
 * resultados, así el input nunca pierde el foco ni el cursor (antes se
 * repintaba la pantalla entera y había que reponer el foco a mano).
 */
export function crearBuscador(opciones: OpcionesBuscador): HTMLElement {
  const { catalogo, alElegir, etiqueta = 'Buscar en el catálogo', placeholder = 'nombre o músculo…', limite = 20, htmlInicial } = opciones;

  const caja = document.createElement('div');
  caja.className = 'buscador';
  caja.innerHTML = `
    <label class="eyebrow" for="buscar-ej">${escapar(etiqueta)}</label>
    <input id="buscar-ej" type="search" autocomplete="off" placeholder="${escapar(placeholder)}" />
    <div data-resultados></div>`;

  const input = caja.querySelector('input') as HTMLInputElement;
  const resultados = caja.querySelector('[data-resultados]') as HTMLElement;

  function pintar() {
    const consulta = input.value.trim();
    if (consulta.length < 2) {
      resultados.innerHTML = htmlInicial?.() ?? '';
      return;
    }
    const encontrados = buscarEjercicios(catalogo, consulta, limite);
    resultados.innerHTML = encontrados.length
      ? htmlOpciones(encontrados)
      : '<p class="ayuda">Nada con ese nombre.</p>';
  }

  input.addEventListener('input', pintar);
  resultados.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-elegir]') as HTMLElement | null;
    if (!boton) return;
    const elegido = catalogo.find((e) => e.id === boton.dataset.elegir);
    if (elegido) alElegir(elegido);
  });

  pintar();
  return caja;
}
