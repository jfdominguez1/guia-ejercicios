// Wizard de entrenamiento: recorre los ejercicios del día, marca series,
// permite cambiar o saltear ejercicios y guarda la sesión. Vive acá y no en el
// .astro para poder testearlo con jsdom.

import { resolverSalteo, variantesDe, ultimaVez } from '../lib/motor';
import { sugerirProgresion } from '../lib/progreso';
import { alternativasDe, dosisInicial, sustituirEjercicio } from '../lib/editor';
import { parsearDiaElegido, resolverDiaDeHoy } from '../lib/dia';
import { formatearObjetivo, formatearFc, unidadEfectiva } from '../lib/formato';
import { conMedida, formatearCrono, medidaSerie, NOMBRE_UNIDAD } from '../lib/serie';
import { convertirDiaSinGym } from '../lib/singym';
import { ETIQUETA_TIPO, tipoPredominante, yaHaySesion } from '../lib/registro';
import { storage } from '../lib/storage';
import { ajustarPeso, aKg, desdeKg, equivalente, formatearPeso, resumenSeries, type UnidadPeso } from '../lib/unidades';
import { crearBuscador, etiquetaGrupo, htmlOpciones } from './buscador';
import { urlGif, urlImg, escapar, rutaBase } from './datos';
import type { DiaRutina, Ejercicio, EjercicioRutina, GrupoEquip, ItemSesion, Perfil, SerieHecha } from '../lib/tipos';

export interface DepsEntrenar {
  /** El contenedor donde se pinta todo el wizard. */
  contenedor: HTMLElement;
  catalogo: Ejercicio[];
  perfil: Perfil;
  hoy: () => string;
  /** Navegación inyectable: en tests no hay window.location real. */
  navegar: (ruta: string) => void;
  /** Inyectable: en el browser es window.confirm; en tests se controla. */
  confirmar: (mensaje: string) => boolean;
}

/** Nombre del día de una sesión libre. Es también cómo se la reconoce en el draft. */
const NOMBRE_LIBRE = 'Sesión libre';

export function montarEntrenar(deps: DepsEntrenar): void {
  const { contenedor: caja, catalogo, perfil, hoy, navegar, confirmar } = deps;

  interface EstadoEj {
    ejercicioId: string;
    variante: GrupoEquip;
    series: Array<SerieHecha & { hecha: boolean }>;
    /** Dosis y movimiento con los que se está trabajando hoy (puede diferir de la rutina). */
    plan: EjercicioRutina;
    /** Lo dejaste pasar hoy. */
    salteado?: boolean;
    /** Id del ejercicio que estaba planificado, si lo cambiaste solo por hoy. */
    enLugarDe?: string;
    /** Nota puntual de hoy para este ejercicio. */
    nota?: string;
  }
  interface Draft {
    fecha: string;
    /** Undefined en sesión libre: no hay día de rutina y la rotación no se corre. */
    diaIndex?: number;
    nombreDia: string;
    indice: number;
    ejercicios: EstadoEj[];
  }

  let dia: DiaRutina;
  let draft: Draft;
  let sinGym = false;
  /** Sesión libre: sin rutina, se van eligiendo los ejercicios sobre la marcha. */
  let libre = false;

  const porId = (id: string) => catalogo.find((e) => e.id === id);
  const unidadEntrada = (): UnidadPeso => storage.getConfig().unidadEntrada ?? 'kg';

  // --- Cronómetro (ejercicios por tiempo: plancha, elongación) ---------------
  // Sin esto el tiempo se estima de memoria después de la serie, que es
  // justamente lo que hace que el número no sirva.
  /** Serie que se está cronometrando, o null. */
  let cronoIndice: number | null = null;
  /** Paso del wizard donde arrancó: si te movés de ejercicio, se apaga solo. */
  let cronoPaso = -1;
  let cronoDesde = 0;
  let cronoTimer: ReturnType<typeof setInterval> | null = null;

  const transcurrido = () => Math.max(1, Math.round((Date.now() - cronoDesde) / 1000));

  /** Corta el cronómetro y devuelve los segundos que corrió (0 si no corría). */
  function pararCrono(): number {
    const segundos = cronoIndice === null ? 0 : transcurrido();
    if (cronoTimer) clearInterval(cronoTimer);
    cronoTimer = null;
    cronoIndice = null;
    return segundos;
  }

  function arrancarCrono(indice: number) {
    pararCrono();
    cronoIndice = indice;
    cronoPaso = draft.indice;
    cronoDesde = Date.now();
    cronoTimer = setInterval(() => {
      const campo = caja.querySelector(`[data-campo="valor"][data-i="${indice}"]`);
      const boton = caja.querySelector(`[data-crono="${indice}"]`);
      // Si cambiaste de ejercicio o de pantalla, no escribe en la serie de otro.
      if (cronoPaso !== draft.indice || !campo || !boton) {
        pararCrono();
        return;
      }
      const segundos = transcurrido();
      (campo as HTMLInputElement).value = String(segundos);
      boton.textContent = `■ ${formatearCrono(segundos)}`;
    }, 1000);
  }

  const cronometrando = (i: number) => cronoIndice === i && cronoPaso === draft.indice;

  function guardarDraft() {
    try {
      localStorage.setItem('ge:draft', JSON.stringify(draft));
    } catch { /* sin espacio: el wizard sigue en memoria */ }
  }

  function armarEstado(e: DiaRutina['ejercicios'][number]): EstadoEj {
    const info = porId(e.ejercicioId);
    const variante = (info?.grupo ?? 'cuerpo') as GrupoEquip;
    const previa = ultimaVez(storage.getSesiones(), e.ejercicioId, variante);
    const unidad = unidadEfectiva(e, info?.tipo ?? 'fuerza');
    const series = Array.from({ length: e.series }, (_, i) => {
      const anterior = previa?.series[i];
      const valor = anterior ? medidaSerie(anterior).valor : e.repsMin;
      const base = conMedida(
        // Lo que levantaste manda; el peso sugerido solo cubre la primera vez.
        { reps: valor, pesoKg: anterior?.pesoKg ?? e.pesoInicialKg },
        valor,
        unidad,
      );
      return { ...base, hecha: false };
    });
    return { ejercicioId: e.ejercicioId, variante, series, plan: e };
  }

  /** Agrega un ejercicio a la sesión libre con la dosis inicial de su tipo. */
  function agregarASesion(ejercicio: Ejercicio) {
    const plan: EjercicioRutina = {
      movimiento: ejercicio.movimiento,
      ejercicioId: ejercicio.id,
      ...dosisInicial(ejercicio.tipo),
    };
    draft.ejercicios = [...draft.ejercicios, armarEstado(plan)];
    draft.indice = draft.ejercicios.length - 1;
    guardarDraft();
    pintar();
  }

  /** Pantalla para sumar un ejercicio: el mismo buscador que el resto de la app. */
  function pintarAgregar() {
    const primero = draft.ejercicios.length === 0;
    caja.innerHTML = `
      <h1>${primero ? 'Sesión libre' : 'Agregar ejercicio'}</h1>
      <p class="ayuda">${primero
        ? 'Elegí lo que vayas a hacer. Podés sumar más en cualquier momento.'
        : `Van ${draft.ejercicios.length} en esta sesión.`}</p>
      <div class="carta" id="caja-buscador"></div>
      ${primero
        ? `<a class="boton-silencioso" style="display:block;text-align:center" href="${rutaBase}/">Salir</a>`
        : '<button class="boton-secundario" id="btn-volver-sesion">Volver a la sesión</button>'}`;
    caja.querySelector('#caja-buscador')!.appendChild(
      crearBuscador({ catalogo, alElegir: agregarASesion, etiqueta: 'Buscar en el catálogo' }),
    );
    caja.querySelector('#btn-volver-sesion')?.addEventListener('click', () => {
      draft.indice = Math.min(draft.indice, draft.ejercicios.length - 1);
      pintar();
    });
  }

  /** Recalcula las series precargando lo que levantaste la última vez con ese ejercicio. */
  function recargarSeries(estado: EstadoEj, ejercicioId: string, variante: GrupoEquip) {
    const previa = ultimaVez(storage.getSesiones(), ejercicioId, variante);
    const unidad = unidadEfectiva(estado.plan, porId(ejercicioId)?.tipo ?? 'fuerza');
    estado.series = estado.series.map((s, i) => {
      const anterior = previa?.series[i];
      const valor = anterior ? medidaSerie(anterior).valor : medidaSerie(s).valor;
      return { ...conMedida({ reps: valor, pesoKg: anterior?.pesoKg }, valor, unidad), hecha: false };
    });
  }

  function cambiarVariante(estado: EstadoEj, grupo: GrupoEquip) {
    const opciones = variantesDe(catalogo, estado.plan.movimiento)[grupo];
    const elegido = opciones[0];
    if (!elegido) return;
    estado.ejercicioId = elegido.id;
    estado.variante = grupo;
    recargarSeries(estado, elegido.id, grupo);
  }

  /** Reemplaza el ejercicio de este paso. `enRutina` lo deja fijo; si no, vale solo hoy. */
  function cambiarEjercicio(estado: EstadoEj, nuevo: Ejercicio, enRutina: boolean) {
    if (!estado.enLugarDe && estado.ejercicioId !== nuevo.id) estado.enLugarDe = estado.ejercicioId;
    if (enRutina && draft.diaIndex !== undefined) {
      const rutina = storage.getRutina();
      if (rutina) storage.setRutina(sustituirEjercicio(rutina, draft.diaIndex, draft.indice, nuevo));
      estado.enLugarDe = undefined;
    }
    const tipoAnterior = porId(estado.ejercicioId)?.tipo;
    estado.ejercicioId = nuevo.id;
    estado.variante = nuevo.grupo;
    estado.salteado = false;
    estado.plan = {
      ...estado.plan,
      ejercicioId: nuevo.id,
      movimiento: nuevo.movimiento,
      // Cambiar una elongación por un ejercicio de fuerza cambia la unidad: si
      // no, la pantalla sigue pidiendo segundos para un press de banca.
      ...(tipoAnterior !== nuevo.tipo ? { unidad: dosisInicial(nuevo.tipo).unidad } : {}),
    };
    recargarSeries(estado, nuevo.id, nuevo.grupo);
  }

  function pintarResumen() {
    const hechos = draft.ejercicios.filter((e) => e.series.some((s) => s.hecha));
    const salteados = draft.ejercicios.filter((e) => e.salteado);
    caja.innerHTML = `<h1>¡Terminaste!</h1>
      <div class="carta">
        <span class="eyebrow">${escapar(draft.nombreDia)}</span>
        <p><strong>${hechos.length}</strong> de ${draft.ejercicios.length} ejercicios con series marcadas.</p>
        ${salteados.length ? `<p class="ayuda">${salteados.length} salteado${salteados.length > 1 ? 's' : ''}: ${escapar(salteados.map((e) => porId(e.ejercicioId)?.nombre_es ?? e.ejercicioId).join(', '))}. Queda anotado, sin drama.</p>` : ''}
      </div>
      <button class="boton-principal" id="btn-guardar">Guardar sesión ✓</button>
      <button class="boton-secundario" id="btn-volver-wizard">Volver</button>`;
    caja.querySelector('#btn-guardar')!.addEventListener('click', () => {
      // El tipo sale de lo que realmente hiciste (los salteados no cuentan): una
      // sesión de elongación tiene que quedar registrada como elongación.
      const idsHechos = hechos.map((e) => e.ejercicioId);
      const tipo = tipoPredominante(
        idsHechos.length ? idsHechos : draft.ejercicios.map((e) => e.ejercicioId),
        catalogo,
      );
      // Mismo guard que "Hecha ✓" en Hoy: dos registros del mismo día inflan la semana.
      if (yaHaySesion(storage.getSesiones(), hoy(), tipo)
        && !confirmar(`Ya registraste una sesión de ${ETIQUETA_TIPO[tipo]} hoy. ¿Agrego otra igual?`)) return;
      const items: ItemSesion[] = draft.ejercicios
        .map((e) => ({
          ejercicioId: e.ejercicioId,
          variante: e.variante,
          ...(porId(e.ejercicioId)?.nombre_es ? { nombre: porId(e.ejercicioId)!.nombre_es } : {}),
          // Se guarda la serie entera menos `hecha` (que es del wizard): así los
          // segundos/minutos llegan al historial y no se pierde la unidad.
          series: e.series
            .filter((s) => s.hecha)
            .map(({ hecha: _hecha, pesoKg, ...serie }) => (pesoKg === undefined ? serie : { ...serie, pesoKg })),
          ...(e.salteado ? { salteado: true as const } : {}),
          ...(e.enLugarDe ? { enLugarDe: e.enLugarDe } : {}),
          ...(e.nota?.trim() ? { nota: e.nota.trim() } : {}),
        }))
        // Los salteados se guardan igual (sin series) para detectar los que esquivás siempre.
        .filter((i) => i.series.length > 0 || i.salteado);
      storage.agregarSesion({
        fecha: hoy(),
        tipo,
        estado: 'hecha',
        // Sin diaIndex en sesión libre: no es un día de la rutina, así que no
        // corre la rotación (resolverSalteo solo mira las que sí lo tienen).
        ...(draft.diaIndex === undefined ? {} : { diaIndex: draft.diaIndex }),
        diaRutina: draft.nombreDia,
        ...(items.length ? { items } : {}),
      });
      localStorage.removeItem('ge:draft');
      sessionStorage.removeItem('ge:libre');
      navegar('/');
    });
    caja.querySelector('#btn-volver-wizard')!.addEventListener('click', () => {
      draft.indice = draft.ejercicios.length - 1;
      pintar();
    });
  }

  /** Elegir otro ejercicio para este paso: equivalentes, mismo músculo o todo el catálogo. */
  function pintarCambiar() {
    const estado = draft.ejercicios[draft.indice]!;
    const info = porId(estado.ejercicioId);
    const alt = info
      ? alternativasDe(catalogo, info, perfil.equipamiento)
      : { equivalentes: [], mismoMusculo: [] };

    caja.innerHTML = `
      <h1>Cambiar ejercicio</h1>
      <p class="ayuda">En lugar de <strong>${escapar(info?.nombre_es ?? estado.ejercicioId)}</strong></p>
      <div class="carta" id="caja-buscador"></div>
      <button class="boton-secundario" id="btn-cancelar-cambio">Volver sin cambiar</button>`;

    // Con el campo vacío se ven las alternativas; al tipear, el catálogo entero.
    const sugerencias = () =>
      `${alt.equivalentes.length ? `<span class="eyebrow" style="display:block;margin-top:10px">Lo mismo, con otro implemento</span>${htmlOpciones(alt.equivalentes)}` : ''}
       ${alt.mismoMusculo.length ? `<span class="eyebrow" style="display:block;margin-top:10px">Otro ejercicio para el mismo músculo</span>${htmlOpciones(alt.mismoMusculo)}` : ''}
       ${!alt.equivalentes.length && !alt.mismoMusculo.length ? '<p class="ayuda">No hay alternativas directas — buscá en el catálogo.</p>' : ''}`;

    caja.querySelector('#caja-buscador')!.appendChild(
      crearBuscador({ catalogo, alElegir: pintarConfirmarCambio, htmlInicial: sugerencias }),
    );
    caja.querySelector('#btn-cancelar-cambio')!.addEventListener('click', pintar);
  }

  /** Solo hoy o para siempre: la pregunta se hace acá, no se asume. */
  function pintarConfirmarCambio(nuevo: Ejercicio) {
    const estado = draft.ejercicios[draft.indice]!;
    const anterior = porId(estado.ejercicioId);
    // En modo sin gym el día se reconstruye y los índices no mapean a la rutina.
    const puedeFijar = !sinGym && !libre;
    caja.innerHTML = `
      <h1>${escapar(nuevo.nombre_es)}</h1>
      <p class="ayuda">Reemplaza a ${escapar(anterior?.nombre_es ?? estado.ejercicioId)}</p>
      ${!nuevo.custom ? `<img class="gif" src="${nuevo.media === 'img' ? urlImg(nuevo.id) : urlGif(nuevo.id)}" alt="" onerror="this.onerror=null;this.src='${urlImg(nuevo.id)}'" />` : ''}
      <div class="carta">
        <span class="eyebrow">¿Hasta cuándo?</span>
        <button class="boton-principal" data-alcance="hoy" style="margin-top:8px">Solo por hoy</button>
        <p class="ayuda">Tu rutina queda como está.</p>
        ${puedeFijar ? `<button data-alcance="siempre" style="width:100%;margin-top:10px">Cambiarlo en la rutina</button>
        <p class="ayuda">Reemplaza el ejercicio en este día, de acá en adelante.</p>` : ''}
      </div>
      <button class="boton-secundario" data-alcance="volver">Volver</button>`;
    caja.querySelectorAll('[data-alcance]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const alcance = (boton as HTMLElement).dataset.alcance;
        if (alcance === 'volver') {
          pintarCambiar();
          return;
        }
        cambiarEjercicio(estado, nuevo, alcance === 'siempre');
        guardarDraft();
        pintar();
      }),
    );
  }

  function pintar() {
    if (libre && draft.ejercicios.length === 0) {
      pintarAgregar();
      return;
    }
    if (draft.indice >= draft.ejercicios.length) {
      pintarResumen();
      guardarDraft();
      return;
    }
    const estado = draft.ejercicios[draft.indice]!;
    const planificado = estado.plan;
    const info = porId(estado.ejercicioId);
    const original = estado.enLugarDe ? porId(estado.enLugarDe) : undefined;
    const variantes = variantesDe(catalogo, planificado.movimiento);
    const gruposDisponibles = (Object.keys(variantes) as GrupoEquip[]).filter((g) => variantes[g].length > 0);
    const fc = formatearFc(planificado);
    const unidad = unidadEntrada();
    // Qué se registra en este ejercicio: reps, segundos o minutos. Sin esto la
    // pantalla pide "reps" hasta en una plancha y el dato queda inservible.
    const unidadEj = unidadEfectiva(planificado, info?.tipo ?? 'fuerza');
    const porTiempo = unidadEj !== 'reps';
    const previa = ultimaVez(storage.getSesiones(), estado.ejercicioId, estado.variante);
    const referencia = previa ? resumenSeries(previa.series) : '';
    // Qué hacer HOY: doble progresión sobre lo de la última vez (mejora 1).
    const sugerencia = info ? sugerirProgresion(previa?.series ?? null, planificado, info) : null;
    const sugConPeso = sugerencia && sugerencia.tipo !== 'sin-datos' ? sugerencia : null;

    caja.innerHTML = `
      <div class="progreso">
        <span class="eyebrow">${escapar(draft.nombreDia)}</span>
        <strong>${draft.indice + 1}/${draft.ejercicios.length}</strong>
      </div>
      <h1>${escapar(info?.nombre_es ?? estado.ejercicioId)}</h1>
      ${original ? `<p class="ayuda">Cambiado por hoy · en lugar de ${escapar(original.nombre_es)}</p>` : ''}
      <p class="ayuda">Objetivo: ${planificado.series}× ${formatearObjetivo(planificado, info?.tipo ?? 'fuerza')}${fc ? ` · ${fc}` : ''}</p>
      ${info && !info.custom ? `<img class="gif" src="${info.media === 'img' ? urlImg(info.id) : urlGif(info.id)}" alt="" onerror="this.onerror=null;this.src='${urlImg(info.id)}'" />` : ''}
      ${info?.pasos.length ? `<details class="carta"><summary style="font-weight:700;cursor:pointer">Cómo se hace</summary><ol style="padding-left:20px">${info.pasos.map((p) => `<li>${escapar(p)}</li>`).join('')}</ol></details>` : ''}
      <div class="carta">
        <span class="eyebrow">¿Con qué lo hacés hoy?</span>
        <div class="chips" style="margin-top:6px">
          ${gruposDisponibles.map((g) => `<button class="chip" data-grupo="${g}" aria-pressed="${g === estado.variante}">${etiquetaGrupo(g)}</button>`).join('')}
        </div>
      </div>
      <div class="carta referencia">
        <span class="eyebrow">${referencia ? 'La última vez' : 'Para arrancar'}</span>
        <p class="dato-referencia">${referencia
          ? escapar(referencia)
          : sugerencia && sugerencia.tipo === 'sin-datos'
            ? escapar(sugerencia.texto)
            : 'Nunca lo hiciste — arrancá cómodo.'}</p>
        ${sugConPeso ? `<div class="sugerencia">
          <span class="eyebrow">Hoy probá</span>
          <p class="dato-sugerencia">${escapar(sugConPeso.texto)}</p>
          <button class="boton-secundario" id="btn-usar-sugerencia">Cargar ${escapar(formatearPeso(sugConPeso.pesoKg))} × ${sugConPeso.reps}</button>
        </div>` : ''}
      </div>
      <div class="carta">
        <div class="cabecera-series">
          <span class="eyebrow">${porTiempo
            ? `${NOMBRE_UNIDAD[unidadEj]} por serie — tocá el círculo al terminar`
            : 'Series — tocá el círculo al terminar'}</span>
          ${porTiempo ? '' : `<div class="chips unidad">
            <button class="chip" data-unidad="kg" aria-pressed="${unidad === 'kg'}">kg</button>
            <button class="chip" data-unidad="lb" aria-pressed="${unidad === 'lb'}">lb</button>
          </div>`}
        </div>
        ${estado.series
          .map((s, i) => {
            const enUnidad = s.pesoKg === undefined ? '' : String(desdeKg(s.pesoKg, unidad));
            const otra = s.pesoKg === undefined ? '' : equivalente(desdeKg(s.pesoKg, unidad), unidad);
            const valor = medidaSerie(s).valor;
            return `<div class="serie${s.hecha ? ' hecha' : ''}${porTiempo ? ' tiempo' : ''}" data-i="${i}">
            <button class="check" aria-label="Serie ${i + 1} ${s.hecha ? 'hecha' : 'pendiente'}">${s.hecha ? '✓' : i + 1}</button>
            <input type="number" inputmode="numeric" data-campo="valor" data-i="${i}" value="${valor}" aria-label="${NOMBRE_UNIDAD[unidadEj]} serie ${i + 1}" />
            ${porTiempo
              ? `<div class="tiempo-serie">
                  <span class="unidad-serie">${unidadEj}</span>
                  ${unidadEj === 'seg'
                    ? `<button class="crono" data-crono="${i}">${cronometrando(i) ? '■ Parar' : '⏱ Cronometrar'}</button>`
                    : ''}
                </div>`
              : `<div class="peso">
              <button class="paso" data-paso="-1" data-i="${i}" aria-label="Bajar peso serie ${i + 1}">−</button>
              <input type="number" inputmode="decimal" step="0.5" data-campo="peso" value="${enUnidad}" placeholder="${unidad}" aria-label="Peso en ${unidad}" />
              <button class="paso" data-paso="1" data-i="${i}" aria-label="Subir peso serie ${i + 1}">+</button>
            </div>
            <span class="equiv" data-equiv="${i}">${otra}</span>`}
          </div>`;
          })
          .join('')}
      </div>
      <div class="carta">
        <label style="margin-top:0">Nota de hoy <span class="eyebrow">(opcional)</span></label>
        <textarea id="nota-ej" rows="2" maxlength="200" placeholder="Ej: el hombro molestó en la última serie">${escapar(estado.nota ?? '')}</textarea>
      </div>
      <div class="acciones-ej">
        <button id="btn-cambiar">Cambiar ejercicio ⇄</button>
        ${libre
          ? '<button id="btn-quitar-libre">Sacar de la sesión</button>'
          : `<button id="btn-saltear">${estado.salteado ? 'Salteado — deshacer' : 'Hoy no lo hago'}</button>`}
      </div>
      ${libre ? '<button class="boton-secundario" id="btn-sumar">+ Agregar otro ejercicio</button>' : ''}
      <div class="nav">
        <button id="btn-anterior" ${draft.indice === 0 ? 'disabled' : ''}>‹ Anterior</button>
        <button id="btn-siguiente" class="boton-principal" style="width:auto;flex:2">${draft.indice + 1 === draft.ejercicios.length ? 'Terminar' : 'Siguiente ›'}</button>
      </div>
      <a class="boton-silencioso" style="display:block;text-align:center;margin-top:8px" href="${rutaBase}/">Salir (queda guardado el avance)</a>`;

    caja.querySelectorAll('[data-grupo]').forEach((chip) =>
      chip.addEventListener('click', () => {
        cambiarVariante(estado, (chip as HTMLElement).dataset.grupo as GrupoEquip);
        guardarDraft();
        pintar();
      }),
    );
    caja.querySelectorAll('.serie').forEach((fila) => {
      const i = Number((fila as HTMLElement).dataset.i);
      fila.querySelector('.check')!.addEventListener('click', () => {
        estado.series[i]!.hecha = !estado.series[i]!.hecha;
        guardarDraft();
        pintar();
      });
      fila.querySelectorAll('input').forEach((input) =>
        input.addEventListener('change', () => {
          const campo = (input as HTMLInputElement).dataset.campo;
          const valor = Number((input as HTMLInputElement).value);
          if (campo === 'valor') {
            estado.series[i] = {
              ...conMedida(estado.series[i]!, valor || 0, unidadEj),
              hecha: estado.series[i]!.hecha,
            };
          } else {
            // Lo tipeado está en la unidad activa; al dato siempre entra en kg.
            estado.series[i]!.pesoKg = valor ? aKg(valor, unidad) : undefined;
            const otra = fila.querySelector(`[data-equiv="${i}"]`) as HTMLElement | null;
            if (otra) otra.textContent = equivalente(valor, unidad);
          }
          guardarDraft();
        }),
      );
    });
    caja.querySelectorAll('[data-crono]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const i = Number((boton as HTMLElement).dataset.crono);
        if (cronometrando(i)) {
          const segundos = pararCrono();
          estado.series[i] = { ...conMedida(estado.series[i]!, segundos, 'seg'), hecha: true };
          guardarDraft();
        } else {
          arrancarCrono(i);
        }
        pintar();
      }),
    );
    caja.querySelectorAll('[data-paso]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const b = boton as HTMLElement;
        const i = Number(b.dataset.i);
        const signo = Number(b.dataset.paso) as 1 | -1;
        const serie = estado.series[i]!;
        const ajustado = ajustarPeso(serie.pesoKg, unidad, signo);
        serie.pesoKg = ajustado || undefined;
        guardarDraft();
        pintar();
      }),
    );
    caja.querySelectorAll('[data-unidad]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const elegida = (chip as HTMLElement).dataset.unidad as UnidadPeso;
        storage.setConfig({ ...storage.getConfig(), unidadEntrada: elegida });
        pintar();
      }),
    );
    caja.querySelector('#btn-usar-sugerencia')?.addEventListener('click', () => {
      if (!sugConPeso) return;
      // Precarga todas las series con lo sugerido; después ajustás a mano si querés.
      estado.series = estado.series.map(() => ({ reps: sugConPeso.reps, pesoKg: sugConPeso.pesoKg, hecha: false }));
      guardarDraft();
      pintar();
    });
    const notaEl = caja.querySelector('#nota-ej') as HTMLTextAreaElement | null;
    notaEl?.addEventListener('input', () => {
      estado.nota = notaEl.value;
      guardarDraft();
    });
    caja.querySelector('#btn-cambiar')!.addEventListener('click', pintarCambiar);
    caja.querySelector('#btn-sumar')?.addEventListener('click', pintarAgregar);
    caja.querySelector('#btn-quitar-libre')?.addEventListener('click', () => {
      draft.ejercicios = draft.ejercicios.filter((_, i) => i !== draft.indice);
      draft.indice = Math.max(0, Math.min(draft.indice, draft.ejercicios.length - 1));
      guardarDraft();
      pintar();
    });
    caja.querySelector('#btn-saltear')?.addEventListener('click', () => {
      estado.salteado = !estado.salteado;
      if (estado.salteado) {
        estado.series = estado.series.map((s) => ({ ...s, hecha: false }));
        draft.indice += 1;
      }
      guardarDraft();
      pintar();
    });
    caja.querySelector('#btn-anterior')?.addEventListener('click', () => {
      draft.indice -= 1;
      guardarDraft();
      pintar();
    });
    caja.querySelector('#btn-siguiente')!.addEventListener('click', () => {
      draft.indice += 1;
      guardarDraft();
      pintar();
    });
  }

  /** Draft crudo, sin validar: para saber qué tipo de sesión hay en curso. */
  function leerDraftCrudo(): Draft | null {
    try {
      return JSON.parse(localStorage.getItem('ge:draft') ?? 'null') as Draft | null;
    } catch {
      return null;
    }
  }

  /**
   * Draft de hoy si sigue sirviendo. En sesión libre el largo es libre; en una
   * sesión de rutina tiene que coincidir con el día (si se editó a mitad de
   * camino, el draft viejo ya no representa lo que hay).
   */
  function retomarDraft(diaActual: DiaRutina): Draft | null {
    const previo = leerDraftCrudo();
    if (!previo?.ejercicios) return null;
    // `plan` faltante = draft de una versión anterior de la app: se descarta.
    const compatible = previo.ejercicios.every((e) => e.plan);
    const largoOk = libre || previo.ejercicios.length === diaActual.ejercicios.length;
    if (previo.fecha === hoy() && previo.nombreDia === diaActual.nombre && compatible && largoOk) {
      return previo;
    }
    return null;
  }

  function iniciar() {
    // El flag alcanza para entrar, pero el draft manda: si volviste a Hoy (que
    // limpia el flag) y seguís con una sesión libre a medias, se retoma igual.
    const enCurso = leerDraftCrudo();
    libre =
      sessionStorage.getItem('ge:libre') === hoy() ||
      (enCurso?.fecha === hoy() && enCurso?.nombreDia === NOMBRE_LIBRE);
    if (libre) {
      dia = { nombre: NOMBRE_LIBRE, enfoque: 'lo que salga', ejercicios: [] };
      draft = retomarDraft(dia) ?? { fecha: hoy(), nombreDia: NOMBRE_LIBRE, indice: 0, ejercicios: [] };
      pintar();
      return;
    }
    const rutina = storage.getRutina();
    if (!rutina) {
      navegar('/perfil/');
      return;
    }
    const salteo = resolverSalteo(rutina, storage.getSesiones(), hoy());
    const diaElegido = parsearDiaElegido(sessionStorage.getItem('ge:dia'), hoy(), rutina.dias.length);
    const { diaIndex, dia: diaPlan } = resolverDiaDeHoy(rutina, salteo.diaIndex, diaElegido);
    sinGym = sessionStorage.getItem('ge:singym') === hoy();
    dia = sinGym ? convertirDiaSinGym(diaPlan, catalogo, storage.getCustoms(), perfil).dia : diaPlan;

    const previo = retomarDraft(dia);
    if (previo) {
      draft = previo;
      pintar();
      return;
    }
    draft = {
      fecha: hoy(),
      diaIndex,
      nombreDia: dia.nombre,
      indice: 0,
      ejercicios: dia.ejercicios.map(armarEstado),
    };
    pintar();
  }

  iniciar();
}
