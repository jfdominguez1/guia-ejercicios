// Wizard de entrenamiento: recorre los ejercicios del día, marca series,
// permite cambiar o saltear ejercicios y guarda la sesión. Vive acá y no en el
// .astro para poder testearlo con jsdom.

import { resolverSalteo, variantesDe, ultimaVez } from '../lib/motor';
import { alternativasDe, sustituirEjercicio } from '../lib/editor';
import { parsearDiaElegido, resolverDiaDeHoy } from '../lib/dia';
import { formatearObjetivo, formatearFc } from '../lib/formato';
import { convertirDiaSinGym } from '../lib/singym';
import { storage } from '../lib/storage';
import { ajustarPeso, aKg, desdeKg, equivalente, resumenSeries, type UnidadPeso } from '../lib/unidades';
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
}

export function montarEntrenar(deps: DepsEntrenar): void {
  const { contenedor: caja, catalogo, perfil, hoy, navegar } = deps;

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
  }
  interface Draft {
    fecha: string;
    diaIndex: number;
    nombreDia: string;
    indice: number;
    ejercicios: EstadoEj[];
  }

  let dia: DiaRutina;
  let draft: Draft;
  let sinGym = false;

  const porId = (id: string) => catalogo.find((e) => e.id === id);
  const unidadEntrada = (): UnidadPeso => storage.getConfig().unidadEntrada ?? 'kg';

  function guardarDraft() {
    try {
      localStorage.setItem('ge:draft', JSON.stringify(draft));
    } catch { /* sin espacio: el wizard sigue en memoria */ }
  }

  function armarEstado(e: DiaRutina['ejercicios'][number]): EstadoEj {
    const info = porId(e.ejercicioId);
    const variante = (info?.grupo ?? 'cuerpo') as GrupoEquip;
    const previa = ultimaVez(storage.getSesiones(), e.ejercicioId, variante);
    const series = Array.from({ length: e.series }, (_, i) => {
      const anterior = previa?.series[i];
      return { reps: anterior?.reps ?? e.repsMin, pesoKg: anterior?.pesoKg, hecha: false };
    });
    return { ejercicioId: e.ejercicioId, variante, series, plan: e };
  }

  /** Recalcula las series precargando lo que levantaste la última vez con ese ejercicio. */
  function recargarSeries(estado: EstadoEj, ejercicioId: string, variante: GrupoEquip) {
    const previa = ultimaVez(storage.getSesiones(), ejercicioId, variante);
    estado.series = estado.series.map((s, i) => ({
      reps: previa?.series[i]?.reps ?? s.reps,
      pesoKg: previa?.series[i]?.pesoKg,
      hecha: false,
    }));
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
    if (enRutina) {
      const rutina = storage.getRutina();
      if (rutina) storage.setRutina(sustituirEjercicio(rutina, draft.diaIndex, draft.indice, nuevo));
      estado.enLugarDe = undefined;
    }
    estado.ejercicioId = nuevo.id;
    estado.variante = nuevo.grupo;
    estado.salteado = false;
    estado.plan = { ...estado.plan, ejercicioId: nuevo.id, movimiento: nuevo.movimiento };
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
      const items: ItemSesion[] = draft.ejercicios
        .map((e) => ({
          ejercicioId: e.ejercicioId,
          variante: e.variante,
          series: e.series.filter((s) => s.hecha).map(({ reps, pesoKg }) => (pesoKg === undefined ? { reps } : { reps, pesoKg })),
          ...(e.salteado ? { salteado: true as const } : {}),
          ...(e.enLugarDe ? { enLugarDe: e.enLugarDe } : {}),
        }))
        // Los salteados se guardan igual (sin series) para detectar los que esquivás siempre.
        .filter((i) => i.series.length > 0 || i.salteado);
      storage.agregarSesion({
        fecha: hoy(),
        tipo: 'fuerza',
        estado: 'hecha',
        diaIndex: draft.diaIndex,
        diaRutina: draft.nombreDia,
        ...(items.length ? { items } : {}),
      });
      localStorage.removeItem('ge:draft');
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
    const puedeFijar = !sinGym;
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
    const previa = ultimaVez(storage.getSesiones(), estado.ejercicioId, estado.variante);
    const referencia = previa ? resumenSeries(previa.series) : '';

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
        <span class="eyebrow">La última vez</span>
        <p class="dato-referencia">${referencia ? escapar(referencia) : 'Nunca lo hiciste — arrancá cómodo.'}</p>
      </div>
      <div class="carta">
        <div class="cabecera-series">
          <span class="eyebrow">Series — tocá el círculo al terminar</span>
          <div class="chips unidad">
            <button class="chip" data-unidad="kg" aria-pressed="${unidad === 'kg'}">kg</button>
            <button class="chip" data-unidad="lb" aria-pressed="${unidad === 'lb'}">lb</button>
          </div>
        </div>
        ${estado.series
          .map((s, i) => {
            const enUnidad = s.pesoKg === undefined ? '' : String(desdeKg(s.pesoKg, unidad));
            const otra = s.pesoKg === undefined ? '' : equivalente(desdeKg(s.pesoKg, unidad), unidad);
            return `<div class="serie${s.hecha ? ' hecha' : ''}" data-i="${i}">
            <button class="check" aria-label="Serie ${i + 1} ${s.hecha ? 'hecha' : 'pendiente'}">${s.hecha ? '✓' : i + 1}</button>
            <input type="number" inputmode="numeric" data-campo="reps" value="${s.reps}" aria-label="Repeticiones" />
            <div class="peso">
              <button class="paso" data-paso="-1" data-i="${i}" aria-label="Bajar peso serie ${i + 1}">−</button>
              <input type="number" inputmode="decimal" step="0.5" data-campo="peso" value="${enUnidad}" placeholder="${unidad}" aria-label="Peso en ${unidad}" />
              <button class="paso" data-paso="1" data-i="${i}" aria-label="Subir peso serie ${i + 1}">+</button>
            </div>
            <span class="equiv" data-equiv="${i}">${otra}</span>
          </div>`;
          })
          .join('')}
      </div>
      <div class="acciones-ej">
        <button id="btn-cambiar">Cambiar ejercicio ⇄</button>
        <button id="btn-saltear">${estado.salteado ? 'Salteado — deshacer' : 'Hoy no lo hago'}</button>
      </div>
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
          if (campo === 'reps') {
            estado.series[i]!.reps = valor || 0;
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
    caja.querySelector('#btn-cambiar')!.addEventListener('click', pintarCambiar);
    caja.querySelector('#btn-saltear')!.addEventListener('click', () => {
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

  function iniciar() {
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

    const guardado = localStorage.getItem('ge:draft');
    if (guardado) {
      try {
        const previo = JSON.parse(guardado) as Draft;
        // El largo debe coincidir: si se editó la rutina a mitad de día, el draft viejo no sirve.
        // `plan` faltante = draft de una versión anterior de la app: se descarta.
        const compatible = previo.ejercicios.every((e) => e.plan);
        if (previo.fecha === hoy() && previo.nombreDia === dia.nombre && compatible && previo.ejercicios.length === dia.ejercicios.length) {
          draft = previo;
          pintar();
          return;
        }
      } catch { /* draft roto: se arranca de cero */ }
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
