// Pantalla Historial: calendario, listado de sesiones, edición/borrado y alta
// de cardio. Vive acá y no en el .astro para poder testearla con jsdom — los
// <script> inline de Astro no son importables.

import {
  borrarSesion,
  buscarSesion,
  describirSesion,
  editarSesion,
  validarEdicion,
  type EdicionSesion,
} from '../lib/historial';
import { fechaValidaRetro, registrarOtra } from '../lib/registro';
import { resumenSeries } from '../lib/unidades';
import { storage } from '../lib/storage';
import { escapar } from './datos';
import type { Ejercicio, ItemSesion, Sesion, TipoCardio } from '../lib/tipos';

export interface DepsHistorial {
  /** Contenedor con #calendario, #sesiones, #alta-cardio y #btn-cardio. */
  raiz: ParentNode;
  catalogo: Ejercicio[];
  hoy: () => string;
  /** Inyectable: en el browser es window.confirm; en tests se controla. */
  confirmar: (mensaje: string) => boolean;
}

const NOMBRE_TIPO: Record<string, string> = {
  fuerza: 'Fuerza', cardio: 'Cardio', elongacion: 'Elongación', otro: 'Actividad',
};

const MAX_SESIONES_VISIBLES = 60;

export function montarHistorial(deps: DepsHistorial): void {
  const { raiz, catalogo, hoy, confirmar } = deps;
  const buscar = <T extends HTMLElement>(sel: string) => raiz.querySelector(sel) as T;
  const cajaCalendario = buscar('#calendario');
  const cajaSesiones = buscar('#sesiones');
  const cajaCardio = buscar('#alta-cardio');

  let mesVisto = hoy().slice(0, 7); // YYYY-MM
  /** Id de la sesión que se está editando. */
  let editando: string | null = null;

  const porId = (id: string) => catalogo.find((e) => e.id === id);

  function sesionesDe(fecha: string): Sesion[] {
    return storage.getSesiones().filter((s) => s.fecha === fecha);
  }

  function pintarCalendario() {
    const [anio, mes] = mesVisto.split('-').map(Number) as [number, number];
    const primero = new Date(Date.UTC(anio, mes - 1, 1));
    const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const offset = (primero.getUTCDay() + 6) % 7; // lunes primero
    const nombreMes = primero.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const celdas: string[] = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`);
    for (let i = 0; i < offset; i++) celdas.push('<div></div>');
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = `${mesVisto}-${String(d).padStart(2, '0')}`;
      const del = sesionesDe(fecha);
      const clase = del[0] ? ` ${del[0].tipo}` : '';
      celdas.push(`<div class="dia${clase}${fecha === hoy() ? ' hoy' : ''}">${d}</div>`);
    }
    cajaCalendario.innerHTML = `
      <div class="cabecera">
        <button class="boton-silencioso" id="mes-antes">‹</button>
        <strong style="text-transform:capitalize">${nombreMes}</strong>
        <button class="boton-silencioso" id="mes-despues">›</button>
      </div>
      <div class="grilla">${celdas.join('')}</div>
      <div class="leyenda">
        <span><span class="punto" style="background:var(--fuerza)"></span>Fuerza</span>
        <span><span class="punto" style="background:var(--cardio)"></span>Cardio</span>
        <span><span class="punto" style="background:var(--elongacion)"></span>Elongación</span>
        <span><span class="punto" style="background:var(--accion)"></span>Otra</span>
      </div>`;
    cajaCalendario.querySelector('#mes-antes')!.addEventListener('click', () => moverMes(-1));
    cajaCalendario.querySelector('#mes-despues')!.addEventListener('click', () => moverMes(1));
  }

  function moverMes(delta: number) {
    const [anio, mes] = mesVisto.split('-').map(Number) as [number, number];
    const nueva = new Date(Date.UTC(anio, mes - 1 + delta, 1));
    mesVisto = `${nueva.getUTCFullYear()}-${String(nueva.getUTCMonth() + 1).padStart(2, '0')}`;
    pintarCalendario();
  }

  function detalleSesion(s: Sesion): string {
    const lineas: string[] = [];
    if (s.estado === 'otra') lineas.push(`Registrada como "hice otra cosa"${s.duracionMin ? ` · ${s.duracionMin} min` : ''}`);
    if (s.cardio) {
      lineas.push(
        `${s.cardio.tipo} · ${s.cardio.minutos} min${s.cardio.km ? ` · ${s.cardio.km} km` : ''}${s.cardio.sensacion ? ` · ${escapar(s.cardio.sensacion)}` : ''}`,
      );
    }
    if (s.fcPromedio) lineas.push(`🫀 FC promedio ${s.fcPromedio} ppm`);
    if (s.rpe !== undefined) lineas.push(`RPE ${s.rpe}/10`);
    if (s.notas) lineas.push(escapar(s.notas));
    for (const item of s.items ?? []) {
      const nombre = escapar(porId(item.ejercicioId)?.nombre_es ?? item.ejercicioId);
      if (item.salteado) {
        lineas.push(`${nombre}: salteado`);
        continue;
      }
      const series = resumenSeries(item.series);
      const original = item.enLugarDe ? porId(item.enLugarDe) : undefined;
      const cambio = original ? ` <span class="meta">(en lugar de ${escapar(original.nombre_es)})</span>` : '';
      lineas.push(`${nombre} (${item.variante}): ${series}${cambio}`);
    }
    return lineas.map((l) => `<p class="meta">${l}</p>`).join('') || '<p class="meta">Sin detalle — hecha es hecha.</p>';
  }

  /** Formulario de edición. La sesión se referencia por id, no por posición. */
  function htmlPanelEditar(s: Sesion, id: string): string {
    const numero = (etiqueta: string, campo: string, valor: number | undefined, extra = '') =>
      `<div style="flex:1"><label>${etiqueta}</label>
        <input type="number" inputmode="numeric" data-campo="${campo}" value="${valor ?? ''}" ${extra} /></div>`;
    const items = (s.items ?? [])
      .map((item, i) => {
        const series = item.series
          .map(
            (serie, j) => `<div class="serie-edit">
              <span class="meta">Serie ${j + 1}</span>
              <input type="number" inputmode="numeric" data-item="${i}" data-serie="${j}" data-serie-campo="reps" value="${serie.reps}" aria-label="Repeticiones serie ${j + 1}" />
              <input type="number" inputmode="decimal" step="0.5" data-item="${i}" data-serie="${j}" data-serie-campo="peso" value="${serie.pesoKg ?? ''}" placeholder="kg" aria-label="Peso serie ${j + 1}" />
            </div>`,
          )
          .join('');
        return series
          ? `<div class="bloque-item"><strong>${escapar(porId(item.ejercicioId)?.nombre_es ?? item.ejercicioId)}</strong>${series}</div>`
          : '';
      })
      .join('');

    return `<div class="panel-editar" data-panel="${escapar(id)}">
      <label>Fecha</label>
      <input type="date" data-campo="fecha" value="${s.fecha}" max="${hoy()}" />
      <div style="display:flex;gap:8px">
        ${numero('RPE (1-10)', 'rpe', s.rpe, 'min="1" max="10"')}
        ${numero('FC prom.', 'fcPromedio', s.fcPromedio, 'min="40" max="220"')}
        ${s.estado === 'otra' ? numero('Minutos', 'duracionMin', s.duracionMin, 'min="1" max="600"') : ''}
      </div>
      ${s.cardio
        ? `<div style="display:flex;gap:8px">
            ${numero('Min. cardio', 'cardioMin', s.cardio.minutos, 'min="1" max="600"')}
            ${numero('Km', 'cardioKm', s.cardio.km, 'min="0" step="0.1"')}
          </div>
          <label>¿Cómo te sentiste?</label>
          <input type="text" data-campo="cardioSensacion" maxlength="80" value="${escapar(s.cardio.sensacion ?? '')}" />`
        : ''}
      ${items ? `<span class="eyebrow" style="display:block;margin-top:10px">Series</span>${items}` : ''}
      <label>Notas</label>
      <textarea data-campo="notas" rows="2" maxlength="500">${escapar(s.notas ?? '')}</textarea>
      <p class="error" data-errores role="alert"></p>
      <div class="acciones-sesion">
        <button class="boton-principal" data-accion="guardar" data-id="${escapar(id)}" style="flex:2">Guardar cambios</button>
        <button data-accion="cancelar">Cancelar</button>
      </div>
    </div>`;
  }

  function pintarSesiones() {
    // storage.getSesiones() garantiza que todas tengan id (migra las viejas).
    const ordenadas = [...storage.getSesiones()].sort((a, b) => b.fecha.localeCompare(a.fecha));
    cajaSesiones.innerHTML = ordenadas.length
      ? ordenadas
          .slice(0, MAX_SESIONES_VISIBLES)
          .map((s) => {
            const id = s.id!;
            return `<details${editando === id ? ' open' : ''}>
          <summary>${s.fecha} — ${escapar(s.diaRutina ?? NOMBRE_TIPO[s.tipo] ?? s.tipo)}</summary>
          ${detalleSesion(s)}
          ${editando === id
            ? htmlPanelEditar(s, id)
            : `<div class="acciones-sesion">
                <button data-accion="editar" data-id="${escapar(id)}">✎ Editar</button>
                <button data-accion="borrar" data-id="${escapar(id)}">Borrar</button>
              </div>`}
        </details>`;
          })
          .join('')
      : '<div class="carta"><p>Todavía no hay sesiones. La primera se registra desde Hoy con un tap.</p></div>';
    conectarSesiones();
  }

  /** Lee el formulario y arma la edición. Los vacíos quedan en undefined (= borrar campo). */
  function leerEdicion(panel: HTMLElement, s: Sesion): EdicionSesion {
    const texto = (campo: string) =>
      (panel.querySelector(`[data-campo="${campo}"]`) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
    const numero = (campo: string) => {
      const crudo = texto(campo).trim();
      return crudo === '' ? undefined : Number(crudo);
    };
    const items: ItemSesion[] = (s.items ?? []).map((item, i) => ({
      ...item,
      series: item.series.map((_, j) => {
        const leer = (campo: string) =>
          (panel.querySelector(`[data-item="${i}"][data-serie="${j}"][data-serie-campo="${campo}"]`) as HTMLInputElement | null)?.value ?? '';
        const peso = leer('peso').trim();
        return {
          reps: Number(leer('reps')) || 0,
          ...(peso === '' ? {} : { pesoKg: Number(peso) }),
        };
      }),
    }));
    const sensacion = texto('cardioSensacion').trim();
    return {
      fecha: texto('fecha'),
      rpe: numero('rpe'),
      fcPromedio: numero('fcPromedio'),
      duracionMin: numero('duracionMin'),
      notas: texto('notas').trim() || undefined,
      ...(s.cardio
        ? { cardio: { minutos: numero('cardioMin') ?? s.cardio.minutos, km: numero('cardioKm'), sensacion: sensacion || undefined } }
        : {}),
      ...(s.items ? { items } : {}),
    };
  }

  function conectarSesiones() {
    cajaSesiones.querySelectorAll('[data-accion]').forEach((boton) =>
      boton.addEventListener('click', (ev) => {
        ev.preventDefault();
        const b = boton as HTMLElement;
        const accion = b.dataset.accion;
        if (accion === 'cancelar') {
          editando = null;
          pintarSesiones();
          return;
        }
        const id = b.dataset.id!;
        if (accion === 'editar') {
          editando = id;
          pintarSesiones();
          return;
        }
        if (accion === 'borrar') pedirBorrado(id);
        if (accion === 'guardar') guardarEdicion(id);
      }),
    );
  }

  /** El panel se busca por dataset y no por selector: el id puede traer caracteres raros. */
  function panelDe(id: string): HTMLElement | undefined {
    return [...cajaSesiones.querySelectorAll('[data-panel]')].find(
      (el) => (el as HTMLElement).dataset.panel === id,
    ) as HTMLElement | undefined;
  }

  function guardarEdicion(id: string) {
    const sesiones = storage.getSesiones();
    const actual = buscarSesion(sesiones, id);
    const panel = panelDe(id);
    if (!actual || !panel) return;
    const edicion = leerEdicion(panel, actual);
    const errores = validarEdicion(edicion, hoy());
    if (errores.length) {
      (panel.querySelector('[data-errores]') as HTMLElement).textContent = errores.join(' ');
      return;
    }
    if (!confirmar(`¿Guardo los cambios en la sesión del ${edicion.fecha}?`)) return;
    storage.setSesiones(editarSesion(sesiones, id, edicion, hoy()));
    editando = null;
    pintarCalendario();
    pintarSesiones();
  }

  /** Borrar es irreversible y no hay backup automático: se pregunta dos veces. */
  function pedirBorrado(id: string) {
    const sesiones = storage.getSesiones();
    const s = buscarSesion(sesiones, id);
    if (!s) return;
    if (!confirmar(`¿Borrar esta sesión?\n\n${describirSesion(s)}`)) return;
    if (!confirmar('Última: esto no se puede deshacer y no queda backup.\n\n¿La borro igual?')) return;
    storage.setSesiones(borrarSesion(sesiones, id));
    editando = null;
    pintarCalendario();
    pintarSesiones();
  }

  function pintarAltaCardio() {
    const tipos: Array<{ v: TipoCardio; l: string }> = [
      { v: 'corrida', l: 'Corrida' },
      { v: 'caminata', l: 'Caminata' },
      { v: 'bicicleta', l: 'Bici' },
      { v: 'eliptica', l: 'Elíptica' },
      { v: 'cinta', l: 'Cinta' },
    ];
    cajaCardio.innerHTML = `<div class="carta tipo-cardio" id="cardio">
      <span class="eyebrow">Registrar cardio</span>
      <div class="chips" style="margin-top:8px">${tipos.map((t) => `<button class="chip" data-tipo="${t.v}">${t.l}</button>`).join('')}</div>
      <label>¿Qué día?</label><input type="date" id="cardio-fecha" value="${hoy()}" />
      <label>Minutos</label><input type="number" id="cardio-min" inputmode="numeric" value="30" min="5" max="300" />
      <label>Km <span class="eyebrow">(opcional)</span></label><input type="number" id="cardio-km" inputmode="decimal" step="0.1" min="0" />
      <label>FC promedio <span class="eyebrow">(opcional, ppm)</span></label><input type="number" id="cardio-fc" inputmode="numeric" min="40" max="220" placeholder="De tu banda o reloj" />
      <label>¿Cómo te sentiste? <span class="eyebrow">(opcional)</span></label><input type="text" id="cardio-sensacion" maxlength="80" />
      <p class="error" id="cardio-error" role="alert"></p>
      <button class="boton-principal" id="cardio-guardar" disabled>Guardar cardio ✓</button>
    </div>`;
    const valor = (sel: string) => (cajaCardio.querySelector(sel) as HTMLInputElement).value;
    let tipo: TipoCardio | null = null;
    cajaCardio.querySelectorAll('[data-tipo]').forEach((chip) =>
      chip.addEventListener('click', () => {
        cajaCardio.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        tipo = (chip as HTMLElement).dataset.tipo as TipoCardio;
        (cajaCardio.querySelector('#cardio-guardar') as HTMLButtonElement).disabled = false;
      }),
    );
    cajaCardio.querySelector('#cardio-guardar')!.addEventListener('click', () => {
      const error = cajaCardio.querySelector('#cardio-error') as HTMLElement;
      error.textContent = '';
      const fecha = valor('#cardio-fecha');
      const minutos = Number(valor('#cardio-min'));
      const km = Number(valor('#cardio-km')) || undefined;
      const fc = Number(valor('#cardio-fc')) || undefined;
      const sensacion = valor('#cardio-sensacion').trim() || undefined;
      if (!tipo || !minutos) return;
      if (!fechaValidaRetro(fecha, hoy())) {
        error.textContent = 'La fecha tiene que ser de los últimos 7 días.';
        return;
      }
      if (fc !== undefined && (fc < 40 || fc > 220)) {
        error.textContent = 'La FC promedio va entre 40 y 220 ppm.';
        return;
      }
      const base = registrarOtra(tipo === 'caminata' || tipo === 'cinta' ? tipo : 'otro', minutos, fecha);
      storage.agregarSesion({
        ...base,
        tipo: 'cardio',
        estado: 'hecha',
        cardio: { tipo, minutos, ...(km ? { km } : {}), ...(sensacion ? { sensacion } : {}) },
        ...(fc ? { fcPromedio: fc } : {}),
      });
      cajaCardio.innerHTML = '';
      pintarCalendario();
      pintarSesiones();
    });
    cajaCardio.querySelector('#cardio')?.scrollIntoView?.({ block: 'start' });
  }

  buscar('#btn-cardio').addEventListener('click', pintarAltaCardio);
  pintarCalendario();
  pintarSesiones();
  if (globalThis.location?.hash === '#cardio') pintarAltaCardio();
}
