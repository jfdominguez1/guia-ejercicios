// Panel para editar un ejercicio de la rutina: dosis, sustitución y quitar.
// Existía dos veces —el ✎ de Hoy y el ✎ de Rutina— con features distintas que
// habían ido divergiendo (uno editaba descanso y buscaba en el catálogo, el
// otro no). Acá vive una sola vez y las dos pantallas usan esta.

import type { CambioDosis } from '../lib/editor';
import { crearBuscador, htmlOpciones } from './buscador';
import { escapar } from './datos';
import type { Ejercicio, EjercicioRutina, GrupoEquip } from '../lib/tipos';

export interface CambioEjercicio {
  /** Reemplazo elegido, si se eligió alguno. */
  nuevo?: Ejercicio;
  dosis: CambioDosis;
}

export interface OpcionesPanel {
  ejercicio: EjercicioRutina;
  catalogo: Ejercicio[];
  equipamiento: GrupoEquip[];
  confirmar: (mensaje: string) => boolean;
  alGuardar: (cambio: CambioEjercicio) => void;
  alQuitar: () => void;
  alCerrar: () => void;
}

/** Equivalentes del mismo movimiento que se pueden hacer con lo que tenés. */
function equivalentesDe(
  catalogo: Ejercicio[],
  ejercicio: EjercicioRutina,
  equipamiento: GrupoEquip[],
): Ejercicio[] {
  return catalogo.filter(
    (c) =>
      c.movimiento === ejercicio.movimiento &&
      c.id !== ejercicio.ejercicioId &&
      (c.grupo === 'cuerpo' || equipamiento.includes(c.grupo)),
  );
}

export function crearPanelEjercicio(opciones: OpcionesPanel): HTMLElement {
  const { ejercicio, catalogo, equipamiento, confirmar, alGuardar, alQuitar, alCerrar } = opciones;
  const equivalentes = equivalentesDe(catalogo, ejercicio, equipamiento);
  /** Reemplazo pendiente: se aplica al guardar, junto con la dosis. */
  let elegido: Ejercicio | undefined;

  const panel = document.createElement('div');
  panel.className = 'carta panel-ejercicio';
  panel.id = 'panel';
  panel.innerHTML = `
    <div data-reemplazo></div>
    ${equivalentes.length
      ? `<span class="eyebrow">Lo mismo, con otro implemento</span>
         <div data-equivalentes>${htmlOpciones(equivalentes.slice(0, 8))}</div>`
      : ''}
    <div data-buscador></div>
    <div class="dosis-campos">
      <div><label>Series</label><input type="number" inputmode="numeric" data-campo="series" value="${ejercicio.series}" min="1" max="6" /></div>
      <div><label>Desde</label><input type="number" inputmode="numeric" data-campo="repsMin" value="${ejercicio.repsMin}" min="1" /></div>
      <div><label>Hasta</label><input type="number" inputmode="numeric" data-campo="repsMax" value="${ejercicio.repsMax}" min="1" /></div>
      <div><label>Desc. s</label><input type="number" inputmode="numeric" data-campo="descansoSeg" value="${ejercicio.descansoSeg}" min="0" max="600" /></div>
    </div>
    <div class="acciones">
      <button type="button" class="boton-principal" data-accion="guardar">Guardar</button>
      <button type="button" data-accion="quitar">Quitar</button>
      <button type="button" data-accion="cerrar">Cancelar</button>
    </div>`;

  const cajaReemplazo = panel.querySelector('[data-reemplazo]') as HTMLElement;

  function pintarReemplazo() {
    cajaReemplazo.innerHTML = elegido
      ? `<div class="aviso reemplazo">
           <span>Se reemplaza por <strong>${escapar(elegido.nombre_es)}</strong></span>
           <button type="button" class="boton-silencioso" data-quitar-reemplazo aria-label="Deshacer el reemplazo">✕</button>
         </div>`
      : '';
    cajaReemplazo.querySelector('[data-quitar-reemplazo]')?.addEventListener('click', () => {
      elegido = undefined;
      pintarReemplazo();
    });
  }

  const elegir = (e: Ejercicio) => {
    elegido = e;
    pintarReemplazo();
  };

  panel.querySelector('[data-equivalentes]')?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-elegir]') as HTMLElement | null;
    if (!boton) return;
    const e = catalogo.find((c) => c.id === boton.dataset.elegir);
    if (e) elegir(e);
  });

  panel.querySelector('[data-buscador]')!.appendChild(
    crearBuscador({ catalogo, alElegir: elegir, etiqueta: '…o buscá otro ejercicio' }),
  );

  const leer = (campo: string) =>
    Number((panel.querySelector(`[data-campo="${campo}"]`) as HTMLInputElement).value);

  panel.querySelector('.acciones')!.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-accion]') as HTMLElement | null;
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === 'cerrar') return alCerrar();
    if (accion === 'quitar') {
      if (!confirmar('¿Saco este ejercicio del día?')) return;
      return alQuitar();
    }
    alGuardar({
      ...(elegido ? { nuevo: elegido } : {}),
      dosis: {
        series: leer('series') || 1,
        repsMin: leer('repsMin') || 1,
        repsMax: leer('repsMax') || 1,
        descansoSeg: leer('descansoSeg') || 0,
      },
    });
  });

  pintarReemplazo();
  return panel;
}
