// Pantalla Rutina: ver los N días completos y editarlos (dosis, sustituir,
// quitar, agregar). Vive acá y no en el .astro para poder testearla con jsdom.

import {
  actualizarDosis,
  agregarEjercicio,
  quitarEjercicio,
  sustituirEjercicio,
} from '../lib/editor';
import { resolverSalteo, ultimaVezMovimiento } from '../lib/motor';
import { ejerciciosEsquivados } from '../lib/registro';
import { formatearObjetivo, formatearFc, etiquetaDescanso } from '../lib/formato';
import { resumenSeries } from '../lib/unidades';
import { textoRutina } from '../lib/rutina-texto';
import { storage } from '../lib/storage';
import { crearBuscador } from './buscador';
import { crearPanelEjercicio } from './panel-ejercicio';
import { compartirTexto, type ResultadoTexto } from './compartir';
import { escapar, haceDias, rutaBase } from './datos';
import type { Ejercicio, EjercicioRutina, Perfil, Rutina } from '../lib/tipos';

export interface DepsRutina {
  contenedor: HTMLElement;
  catalogo: Ejercicio[];
  perfil: Perfil;
  hoy: () => string;
  confirmar: (mensaje: string) => boolean;
  /** Inyectable para testear sin navigator.share. */
  compartir?: (texto: string, titulo: string) => Promise<ResultadoTexto>;
}

const MENSAJE_COMPARTIR: Record<ResultadoTexto, string> = {
  compartido: '✓ Rutina enviada.',
  copiado: '✓ Copiada — pegala donde quieras (WhatsApp, notas, mail).',
  cancelado: '',
  fallo: 'Este navegador no me deja compartir ni copiar. Probá desde el celular.',
};

/** Panel abierto: edición de un ejercicio o alta en un día. */
type Abierto = { modo: 'editar' | 'agregar'; dia: number; idx: number } | null;

export function montarRutina(deps: DepsRutina): void {
  const { contenedor: caja, catalogo, perfil, hoy, confirmar } = deps;
  const compartir = deps.compartir ?? compartirTexto;
  let abierto: Abierto = null;

  const porId = (id: string) => catalogo.find((e) => e.id === id);

  function htmlEjercicio(e: EjercicioRutina, dia: number, idx: number): string {
    const info = porId(e.ejercicioId);
    const tipo = info?.tipo ?? 'fuerza';
    const fc = formatearFc(e);
    const registro = info
      ? ultimaVezMovimiento(storage.getSesiones(), e.movimiento, info.grupo, catalogo)
      : null;
    const ultima = registro
      ? `<div class="ultima">${haceDias(registro.fecha, hoy())} · ${resumenSeries(registro.series)}</div>`
      : '';
    const editando = abierto?.modo === 'editar' && abierto.dia === dia && abierto.idx === idx;
    return `<div class="ejercicio">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <a href="${rutaBase}/ejercicio/?id=${encodeURIComponent(e.ejercicioId)}">${escapar(info?.nombre_es ?? e.ejercicioId)}</a>
        <button class="boton-silencioso" data-editar data-dia="${dia}" data-idx="${idx}" aria-label="Editar ejercicio">✎</button>
      </div>
      <div class="dosis">${e.series}× ${formatearObjetivo(e, tipo)} · ${etiquetaDescanso(e, tipo)} ${e.descansoSeg}s${fc ? ` · ${fc}` : ''}</div>
      ${ultima}
      ${editando ? '<div data-panel-aqui></div>' : ''}
    </div>`;
  }

  function htmlDia(rutina: Rutina, dia: number, diaHoy: number): string {
    const d = rutina.dias[dia]!;
    const agregando = abierto?.modo === 'agregar' && abierto.dia === dia;
    return `<div class="carta">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="eyebrow">${escapar(d.enfoque)}</span>
        ${dia === diaHoy ? '<span class="hoy-chip">Te toca hoy</span>' : ''}
      </div>
      <h2 style="margin-top:2px">${escapar(d.nombre)}</h2>
      ${d.ejercicios.map((e, i) => htmlEjercicio(e, dia, i)).join('')}
      ${d.ejercicios.length ? '' : '<p class="ayuda">Día vacío — agregale ejercicios o quedará como descanso.</p>'}
      ${agregando
        ? '<div class="carta" id="panel" data-alta></div>'
        : `<button class="boton-secundario" data-agregar data-dia="${dia}">+ Agregar ejercicio</button>`}
    </div>`;
  }

  /** Si venís salteando siempre el mismo ejercicio, conviene cambiarlo de la rutina. */
  function htmlEsquivados(): string {
    const esquivados = ejerciciosEsquivados(storage.getSesiones()).slice(0, 3);
    if (!esquivados.length) return '';
    const lista = esquivados
      .map((e) => `${escapar(porId(e.ejercicioId)?.nombre_es ?? e.ejercicioId)} (${e.veces}×)`)
      .join(', ');
    return `<div class="aviso">Venís salteando: ${lista}. Si no te copa, cambiálo acá con ✎ y listo.</div>`;
  }

  function guardarYCerrar(nueva: Rutina) {
    storage.setRutina(nueva);
    abierto = null;
    pintar();
  }

  /** Inserta el panel de edición en el hueco que dejó htmlEjercicio. */
  function montarPanelEdicion(rutina: Rutina) {
    const hueco = caja.querySelector('[data-panel-aqui]');
    if (!hueco || !abierto) return;
    const ejercicio = rutina.dias[abierto.dia]?.ejercicios[abierto.idx];
    if (!ejercicio) return;
    const { dia, idx } = abierto;
    hueco.appendChild(
      crearPanelEjercicio({
        ejercicio,
        catalogo,
        equipamiento: perfil.equipamiento,
        confirmar,
        alGuardar: ({ nuevo, dosis }) => {
          const base = nuevo ? sustituirEjercicio(rutina, dia, idx, nuevo) : rutina;
          guardarYCerrar(actualizarDosis(base, dia, idx, dosis));
        },
        alQuitar: () => guardarYCerrar(quitarEjercicio(rutina, dia, idx)),
        alCerrar: () => {
          abierto = null;
          pintar();
        },
      }),
    );
  }

  function montarPanelAlta(rutina: Rutina) {
    const hueco = caja.querySelector('[data-alta]');
    if (!hueco || !abierto) return;
    const { dia } = abierto;
    hueco.innerHTML = '';
    hueco.appendChild(
      crearBuscador({
        catalogo,
        etiqueta: 'Buscar ejercicio para agregar',
        alElegir: (elegido) => guardarYCerrar(agregarEjercicio(rutina, dia, elegido)),
      }),
    );
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'boton-secundario';
    cancelar.textContent = 'Cancelar';
    cancelar.addEventListener('click', () => {
      abierto = null;
      pintar();
    });
    hueco.appendChild(cancelar);
  }

  function pintar() {
    const rutina = storage.getRutina();
    if (!rutina) {
      caja.innerHTML = `<div class="carta"><p>Todavía no hay rutina.</p>
        <a class="boton-principal" style="display:block;text-align:center;text-decoration:none" href="${rutaBase}/perfil/">Armar mi rutina</a></div>`;
      return;
    }
    const salteo = resolverSalteo(rutina, storage.getSesiones(), hoy());
    caja.innerHTML = `
      <p class="ayuda">Tocá ✎ para ajustar series, reps o sustituir un ejercicio. Los cambios quedan guardados para las próximas semanas.</p>
      ${htmlEsquivados()}
      ${rutina.dias.map((_, i) => htmlDia(rutina, i, salteo.diaIndex)).join('')}
      <div class="carta">
        <button class="boton-secundario" id="btn-compartir-rutina">📲 Compartir mi rutina</button>
        <p class="ayuda">La manda en texto, lista para leer (WhatsApp, mail, notas).</p>
        <p class="ayuda" id="compartir-resultado" hidden></p>
      </div>`;

    caja.querySelector('#btn-compartir-rutina')?.addEventListener('click', async () => {
      const boton = caja.querySelector('#btn-compartir-rutina') as HTMLButtonElement;
      const aviso = caja.querySelector('#compartir-resultado') as HTMLElement;
      boton.disabled = true;
      const resultado = await compartir(textoRutina(rutina, catalogo), 'Mi rutina');
      boton.disabled = false;
      aviso.textContent = MENSAJE_COMPARTIR[resultado];
      aviso.hidden = !aviso.textContent;
    });

    caja.querySelectorAll('[data-editar]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const b = boton as HTMLElement;
        abierto = { modo: 'editar', dia: Number(b.dataset.dia), idx: Number(b.dataset.idx) };
        pintar();
        caja.querySelector('#panel')?.scrollIntoView?.({ block: 'center' });
      }),
    );
    caja.querySelectorAll('[data-agregar]').forEach((boton) =>
      boton.addEventListener('click', () => {
        abierto = { modo: 'agregar', dia: Number((boton as HTMLElement).dataset.dia), idx: -1 };
        pintar();
        (caja.querySelector('#buscar-ej') as HTMLInputElement | null)?.focus();
      }),
    );
    montarPanelEdicion(rutina);
    montarPanelAlta(rutina);
  }

  pintar();
}
