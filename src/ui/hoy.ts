// Pantalla Hoy: la métrica de la semana, la sesión que toca, el registro de un
// tap y todos los atajos (otro día, sin gym, elongación, bloques, retroactivo).
// Es la pantalla que más decisiones toma; vive acá y no en el .astro para poder
// testearla con jsdom.

import { generarElongacion, regenerar, ultimaVezMovimiento } from '../lib/motor';
import {
  estadoCarriles,
  resumenSemana,
  textoUltimaVez,
  CARRILES,
  NOMBRE_CARRIL,
  type EstadoCarril,
} from '../lib/carriles';
import { actualizarDosis, quitarEjercicio, sustituirEjercicio } from '../lib/editor';
import {
  diaSugeridoDeHoy,
  opcionesDeDia,
  parsearDiaElegido,
  resolverDiaDeHoy,
  serializarDiaElegido,
} from '../lib/dia';
import { estadoHome, type ResultadoRetomar } from '../lib/retomar';
import { registrarHecha, registrarOtra, registrarGrupo, fechaValidaRetro, resumenSemanal, yaHaySesion, ETIQUETA_TIPO, type TipoRapido } from '../lib/registro';
import { convertirDiaSinGym } from '../lib/singym';
import { formatearObjetivo, formatearFc, etiquetaDescanso } from '../lib/formato';
import { calcularRacha, fechaLarga, fraseRacha } from '../lib/racha';
import { estadoRespaldo, textoRespaldo } from '../lib/respaldo';
import { respaldar as respaldarReal, ultimoRespaldo, type ResultadoRespaldo } from './respaldo';
import { resumenSeries } from '../lib/unidades';
import { storage } from '../lib/storage';
import { crearPanelEjercicio } from './panel-ejercicio';
import { escapar, haceDias, repararTiposDeSesion, rutaBase } from './datos';
import type { DiaRutina, Ejercicio, Perfil, Rutina, Sesion } from '../lib/tipos';

export interface DepsHoy {
  contenedor: HTMLElement;
  catalogo: Ejercicio[];
  perfil: Perfil;
  hoy: () => string;
  confirmar: (mensaje: string) => boolean;
  /** Navegación inyectable: en tests no hay window.location real. */
  navegar: (ruta: string) => void;
  /** Compartir el respaldo. Inyectable: en tests no hay navigator.share. */
  respaldar?: (hoy: string) => Promise<ResultadoRespaldo>;
}

/** Día elegido a mano para hoy (pisa la rotación). Vale solo por hoy. */
const CLAVE_DIA = 'ge:dia';

export function montarHoy(deps: DepsHoy): void {
  const { contenedor: caja, catalogo, perfil, hoy, confirmar, navegar } = deps;
  const respaldar = deps.respaldar ?? respaldarReal;
  const $ = <T extends HTMLElement>(sel: string) => caja.querySelector(sel) as T;
  repararTiposDeSesion(catalogo);
  let modoSinGym = sessionStorage.getItem('ge:singym') === hoy();

  function porId(id: string): Ejercicio | undefined {
    return catalogo.find((e) => e.id === id);
  }

  function hayDraftHoy(): boolean {
    try {
      const draft = JSON.parse(localStorage.getItem('ge:draft') ?? 'null');
      return draft?.fecha === hoy();
    } catch {
      return false;
    }
  }

  /** Estado de los tres carriles con los datos de hoy. Se recalcula al pintar. */
  function carriles() {
    return estadoCarriles(
      storage.getRutina(),
      storage.getSesiones(),
      catalogo,
      hoy(),
      storage.getConfig(),
    );
  }

  /**
   * La semana por tipo. El número único mostraba verde cinco semanas seguidas
   * mientras la elongación llegaba a 1 de 4: sumar peras con manzanas no puede
   * mostrar un hueco de un solo tipo.
   */
  function htmlSemana(estados: EstadoCarril[]): string {
    const config = storage.getConfig();
    const sesiones = storage.getSesiones();
    const racha = calcularRacha(sesiones, hoy(), config.objetivoSemanal);
    // La racha solo aparece cuando existe: un "0 semanas" sería un reproche.
    const insignia = racha.semanas >= 2
      ? `<span class="insignia" title="Semanas seguidas cumpliendo el objetivo">🔥 ${racha.semanas}</span>`
      : '';
    // En el orden de siempre, no por deuda: es un tablero, no una cola.
    const filas = CARRILES.map((c) => {
      const e = estados.find((x) => x.carril === c)!;
      const discos = Array.from(
        { length: Math.max(e.meta, Math.min(e.hechas, 7)) },
        (_, i) => `<div class="disco${i < e.hechas ? ' lleno' : ''}"></div>`,
      ).join('');
      return `<div class="fila-meta tipo-${c}" data-meta="${c}">
        <span class="nombre">${NOMBRE_CARRIL[c]}</span>
        <div class="discos">${discos}</div>
        <span class="conteo">${e.hechas}/${e.meta}</span>
      </div>`;
    }).join('');
    return `<div class="carta semana">
      <div class="semana-top">
        <span class="eyebrow">${escapar(fechaLarga(hoy()))}</span>
        ${insignia}
      </div>
      <div class="metas">${filas}</div>
      <p class="frase">${escapar(resumenSemana(estados))}</p>
    </div>`;
  }

  /**
   * Los tres carriles, el más atrasado arriba. El home deja de dar una orden
   * ("hoy te toca X") y pasa a ofrecer: los tres están a un tap y cada uno sabe
   * por dónde va su propia rotación.
   */
  function htmlCarriles(estados: EstadoCarril[], destacado: number | undefined): string {
    const filas = estados
      .filter((e) => e.dias.length > 0)
      .map((e) => {
        const esDestacado = e.proximo?.diaIndex === destacado;
        return `<button class="carril tipo-${e.carril}${esDestacado ? ' destacado' : ''}" data-carril-dia="${e.proximo!.diaIndex}">
          <div class="carril-top">
            <span class="eyebrow">${NOMBRE_CARRIL[e.carril]}</span>
            <span class="ayuda">${escapar(textoUltimaVez(e))}</span>
          </div>
          <strong>${escapar(e.proximo!.nombre)}</strong>
          <span class="ayuda">${e.hechas} de ${e.meta} esta semana</span>
        </button>`;
      })
      .join('');
    if (!filas) return '';
    return `<div class="carriles"><span class="eyebrow">¿Qué hacés hoy?</span>${filas}</div>`;
  }

  /** Recordatorio de respaldo: aparece arriba de todo cuando hace días que no saca una copia. */
  function htmlRespaldo(): string {
    if (sessionStorage.getItem('ge:respaldoOculto') === hoy()) return '';
    const hayDatos = storage.getSesiones().length > 0 || storage.getRutina() !== null;
    const estado = estadoRespaldo(ultimoRespaldo(), hoy(), hayDatos);
    if (!estado.avisar) return '';
    return `<div class="aviso respaldo" id="aviso-respaldo">
      <span>⚠️ ${escapar(textoRespaldo(estado))}</span>
      <div class="respaldo-acciones">
        <button class="boton-principal" id="btn-respaldar">Respaldar</button>
        <button class="boton-silencioso" id="btn-respaldo-cerrar">Ahora no</button>
      </div>
    </div>`;
  }

  async function hacerRespaldo() {
    const boton = $('#btn-respaldar') as HTMLButtonElement | null;
    if (boton) { boton.disabled = true; boton.textContent = 'Preparando…'; }
    const resultado = await respaldar(hoy());
    if (resultado === 'cancelado') {
      // No se guardó nada: dejamos el aviso para que pueda reintentar.
      if (boton) { boton.disabled = false; boton.textContent = 'Respaldar'; }
      return;
    }
    const aviso = $('#aviso-respaldo');
    if (aviso) {
      aviso.className = 'aviso respaldo ok';
      aviso.innerHTML = resultado === 'compartido'
        ? '✓ Copia enviada. Guardala en Drive, WhatsApp o donde la tengas a mano.'
        : '✓ Copia descargada. Movela a Drive o mandátela para tenerla fuera del teléfono.';
    }
  }

  function htmlEjercicio(e: DiaRutina['ejercicios'][number], idx = -1, editable = false): string {
    const info = porId(e.ejercicioId);
    const tipo = info?.tipo ?? 'fuerza';
    const fc = formatearFc(e);
    const registro = info
      ? ultimaVezMovimiento(storage.getSesiones(), e.movimiento, info.grupo, catalogo)
      : null;
    let ultima = 'Nunca lo hiciste';
    if (registro) {
      const rpe = registro.rpe !== undefined ? ` · RPE ${registro.rpe}` : '';
      ultima = `${haceDias(registro.fecha, hoy())} · ${resumenSeries(registro.series)}${rpe}`;
    }
    return `<div class="ejercicio">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <a href="${rutaBase}/ejercicio/?id=${encodeURIComponent(e.ejercicioId)}">${escapar(info?.nombre_es ?? e.ejercicioId)}</a>
        ${editable ? `<button class="boton-silencioso editar" data-idx="${idx}" aria-label="Editar ejercicio">✎</button>` : ''}
      </div>
      <div class="dosis">${e.series}× ${formatearObjetivo(e, tipo)} · ${etiquetaDescanso(e, tipo)} ${e.descansoSeg}s${fc ? ` · ${fc}` : ''}</div>
      <div class="ultima">${ultima}</div>
    </div>`;
  }

  /**
   * Qué se entrena hoy, dicho con todas las letras y con la salida al lado.
   * Antes el nombre del día era un título más y cambiarlo estaba enterrado en
   * "Más opciones": si te toca piernas y querés espalda, tiene que estar a la
   * vista, no escondido.
   */
  function htmlEncabezadoDia(titulo: string, dia: DiaRutina, alternable: boolean): string {
    return `<div class="dia-hoy">
      <div class="dia-hoy-texto">
        <span class="eyebrow">${escapar(titulo)}</span>
        <h2>${escapar(dia.nombre)}</h2>
        <p class="ayuda">${escapar(dia.enfoque)} · ${dia.ejercicios.length} ejercicios</p>
      </div>
      ${alternable ? '<button id="btn-otro-dia">Cambiar<br />día ⇄</button>' : ''}
    </div>`;
  }

  function htmlSesion(dia: DiaRutina, avisos: string[] = [], editable = false): string {
    return `<div class="carta">
      ${dia.ejercicios.map((e, i) => htmlEjercicio(e, i, editable)).join('')}
      ${avisos.map((a) => `<p class="ayuda">⚠️ ${escapar(a)}</p>`).join('')}
    </div>`;
  }

  /** Descarta el entrenamiento a medias si cambiás de día (los ejercicios ya no son los mismos). */
  function limpiarDraftSiCambiaDia(): boolean {
    if (!hayDraftHoy()) return true;
    if (!confirmar('Tenés un entrenamiento a medias de hoy. Si cambiás de día se descarta. ¿Sigo?')) return false;
    localStorage.removeItem('ge:draft');
    return true;
  }

  function panelElegirDia(rutina: Rutina, diaSugerido: number, diaActivo: number) {
    const opciones = opcionesDeDia(rutina, diaSugerido, diaActivo);
    const carta = document.createElement('div');
    carta.className = 'carta';
    carta.innerHTML = `<span class="eyebrow">¿Qué querés hacer hoy?</span>
      <p class="ayuda">Cambia solo el día de hoy. Tu rutina no se toca.</p>
      <div class="lista-dias">${opciones
        .map(
          (o) => `<button class="opcion-dia${o.activo ? ' activa' : ''}" data-dia="${o.index}">
            <strong>${escapar(o.nombre)}</strong>
            <span class="ayuda">${escapar(o.enfoque)} · ${o.cantidad} ejercicios${o.sugerido ? ' · te tocaba hoy' : ''}</span>
          </button>`,
        )
        .join('')}</div>
      <button class="boton-silencioso" data-dia="cerrar">Cancelar</button>`;
    carta.addEventListener('click', (ev) => {
      const boton = (ev.target as HTMLElement).closest('[data-dia]') as HTMLElement | null;
      if (!boton) return;
      const valor = boton.dataset.dia!;
      if (valor !== 'cerrar') {
        if (!limpiarDraftSiCambiaDia()) return;
        sessionStorage.setItem(CLAVE_DIA, serializarDiaElegido(hoy(), Number(valor)));
      }
      carta.remove();
      pintar();
    });
    caja.prepend(carta);
    globalThis.scrollTo?.({ top: 0 });
  }

  /** Mismo panel que la pantalla Rutina: una sola implementación para las dos. */
  function panelEditar(diaIndex: number, idx: number) {
    const rutina = storage.getRutina();
    const ejercicio = rutina?.dias[diaIndex]?.ejercicios[idx];
    if (!rutina || !ejercicio) return;
    const cerrar = () => {
      caja.querySelector('#panel')?.remove();
    };
    const guardar = (nueva: Rutina) => {
      storage.setRutina(nueva);
      cerrar();
      pintar();
    };
    cerrar();
    caja.prepend(
      crearPanelEjercicio({
        ejercicio,
        catalogo,
        equipamiento: perfil.equipamiento,
        confirmar,
        alGuardar: ({ nuevo, dosis }) => {
          const base = nuevo ? sustituirEjercicio(rutina, diaIndex, idx, nuevo) : rutina;
          guardar(actualizarDosis(base, diaIndex, idx, dosis));
        },
        alQuitar: () => guardar(quitarEjercicio(rutina, diaIndex, idx)),
        alCerrar: cerrar,
      }),
    );
    globalThis.scrollTo?.({ top: 0 });
  }

  /**
   * Guarda la sesión y pregunta el RPE. **La pantalla se repinta recién al
   * cerrar la carta**, no antes.
   *
   * Antes repintaba en el acto: al registrar la elongación, el carril más
   * atrasado pasaba a ser otro y el botón "Hecha ✓" —en el mismo lugar de la
   * pantalla, ahora tapado por el "Guardada ✓"— pasaba a significar otro día.
   * Un tap de más registraba un cardio que nunca hiciste, y como era de otro
   * tipo, ningún aviso de duplicado lo frenaba.
   */
  function guardarYPedirRpe(sesion: Sesion) {
    storage.agregarSesion(sesion);
    const carta = document.createElement('div');
    carta.className = 'carta pop';
    carta.innerHTML = `<strong>Guardada ✓</strong>
      <p class="ayuda">¿Qué tan dura estuvo? (opcional)</p>
      <div class="chips rpe-chips">${Array.from({ length: 10 }, (_, i) => `<button class="chip" data-rpe="${i + 1}">${i + 1}</button>`).join('')}
      <button class="chip" data-rpe="">Omitir</button></div>`;
    caja.prepend(carta);
    carta.addEventListener('click', (ev) => {
      const boton = (ev.target as HTMLElement).closest('[data-rpe]') as HTMLElement | null;
      if (!boton) return;
      const rpe = Number(boton.dataset.rpe);
      if (rpe) {
        const sesiones = storage.getSesiones();
        const ultima = sesiones[sesiones.length - 1];
        if (ultima) storage.setSesiones([...sesiones.slice(0, -1), { ...ultima, rpe }]);
      }
      carta.remove();
      // Recién ahora: el día que ofrece el home puede haber cambiado con lo que
      // se acaba de registrar, y no queremos que cambie mientras tocás.
      pintar();
    });
  }

  function panelOtraCosa(fecha: string) {
    const carta = document.createElement('div');
    carta.className = 'carta';
    const tipos: Array<{ v: TipoRapido; l: string }> = [
      { v: 'caminata', l: 'Caminata' },
      { v: 'cinta', l: 'Cinta' },
      { v: 'fuerza', l: 'Fuerza' },
      { v: 'elongacion', l: 'Elongación' },
      { v: 'otro', l: 'Otro' },
    ];
    carta.innerHTML = `<span class="eyebrow">¿Qué hiciste${fecha === hoy() ? '' : ` el ${fecha}`}?</span>
      <div class="chips" style="margin-top:8px">${tipos.map((t) => `<button class="chip" data-tipo="${t.v}">${t.l}</button>`).join('')}</div>
      <label>Duración aproximada (min)</label>
      <input type="number" inputmode="numeric" value="30" min="5" max="300" />
      <button class="boton-principal" style="margin-top:10px" disabled>Guardar</button>`;
    const input = carta.querySelector('input')!;
    const guardar = carta.querySelector('.boton-principal') as HTMLButtonElement;
    let tipo: TipoRapido | null = null;
    carta.addEventListener('click', (ev) => {
      const chip = (ev.target as HTMLElement).closest('[data-tipo]') as HTMLElement | null;
      if (!chip) return;
      for (const c of carta.querySelectorAll('.chip')) c.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-pressed', 'true');
      tipo = chip.dataset.tipo as TipoRapido;
      guardar.disabled = false;
    });
    guardar.addEventListener('click', () => {
      if (!tipo) return;
      storage.agregarSesion(registrarOtra(tipo, Number(input.value) || 30, fecha));
      carta.remove();
      pintar();
    });
    caja.prepend(carta);
  }

  function panelRetro() {
    const carta = document.createElement('div');
    carta.className = 'carta';
    carta.innerHTML = `<span class="eyebrow">Registrar un día pasado</span>
      <label>¿Qué día?</label><input type="date" />
      <p class="error"></p>
      <div class="acciones-extra">
        <button data-accion="hecha">La sesión que tocaba ✓</button>
        <button data-accion="otra">Hice otra cosa</button>
      </div>`;
    const inputFecha = carta.querySelector('input')!;
    const error = carta.querySelector('.error')!;
    carta.addEventListener('click', (ev) => {
      const boton = (ev.target as HTMLElement).closest('[data-accion]') as HTMLElement | null;
      if (!boton) return;
      const fecha = inputFecha.value;
      if (!fecha || !fechaValidaRetro(fecha, hoy())) {
        error.textContent = 'Elegí una fecha de los últimos 7 días.';
        return;
      }
      carta.remove();
      if (boton.dataset.accion === 'otra') {
        panelOtraCosa(fecha);
      } else {
        const rutina = storage.getRutina();
        if (rutina) {
          // El mismo día que ofrece el home, no el de la rotación vieja: esta
          // pantalla anotaba "Día 4 — Bici" (¡un cardio!) cuando lo que tocaba
          // era la elongación, y ese dato falso queda en el historial.
          const dia = diaSugeridoDeHoy(rutina, storage.getSesiones(), catalogo, fecha, storage.getConfig());
          storage.agregarSesion(registrarHecha(rutina, dia, catalogo, fecha));
          pintar();
        }
      }
    });
    caja.prepend(carta);
  }

  function htmlBloques(): string {
    const grupos = storage.getGrupos();
    if (!grupos.length) return '';
    return `<h2>Mis bloques</h2>${grupos
      .map(
        (g, i) => `<details class="carta">
        <summary style="font-weight:700;cursor:pointer">${escapar(g.nombre)} <span class="eyebrow">(${g.ejercicios.length})</span></summary>
        ${g.descripcion ? `<p class="ayuda">${escapar(g.descripcion)}</p>` : ''}
        ${g.ejercicios.map((e) => htmlEjercicio(e)).join('')}
        <button class="boton-principal" data-bloque="${i}" style="margin-top:8px">Hecho ✓</button>
        <button class="boton-silencioso" data-quitar-bloque="${i}">Quitar bloque</button>
      </details>`,
      )
      .join('')}`;
  }

  function conectarBloques() {
    caja.querySelectorAll('[data-bloque]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const grupo = storage.getGrupos()[Number((boton as HTMLElement).dataset.bloque)];
        if (grupo) guardarYPedirRpe(registrarGrupo(grupo, catalogo, hoy()));
      }),
    );
    caja.querySelectorAll('[data-quitar-bloque]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const i = Number((boton as HTMLElement).dataset.quitarBloque);
        const grupo = storage.getGrupos()[i];
        if (grupo && confirmar(`¿Quito el bloque "${grupo.nombre}"?`)) {
          storage.setGrupos(storage.getGrupos().filter((_, j) => j !== i));
          pintar();
        }
      }),
    );
  }

  function htmlRetomar(retomar: ResultadoRetomar): string {
    return `<div class="carta retomar">
      <h2>Retomar hoy</h2>
      <p>${escapar(retomar.mensaje ?? '')}</p>
      <button class="boton-principal" id="btn-retomar">Retomar hoy</button>
      ${retomar.sugerirIA ? `<a class="boton boton-secundario" style="display:block;text-align:center" href="${rutaBase}/perfil/#ia">Exportar para mi IA</a>` : ''}
    </div>`;
  }

  function pintar() {
    const rutina = storage.getRutina();
    if (!rutina) {
      caja.innerHTML = `${htmlSemana(carriles())}<div class="carta"><p>Todavía no hay rutina.</p>
        <a class="boton-principal" style="display:block;text-align:center;text-decoration:none" href="${rutaBase}/perfil/">Armar mi rutina</a></div>`;
      return;
    }
    const sesiones = storage.getSesiones();
    const config = storage.getConfig();
    const estado = estadoHome(rutina, sesiones, hoy(), config, catalogo);

    // Modo retomar: una sola cosa en pantalla. Cero culpa.
    if (estado.modo === 'retomar' && !sessionStorage.getItem('ge:retomando')) {
      caja.innerHTML = htmlSemana(carriles()) + htmlRetomar(estado.retomar!);
      $('#btn-retomar')?.addEventListener('click', () => {
        sessionStorage.setItem('ge:retomando', hoy());
        pintar();
      });
      return;
    }

    const retomando = estado.modo === 'retomar' && estado.retomar?.sesionReducida;
    const estados = carriles();
    // El día que se destaca sale del carril MÁS ATRASADO, no de la rotación
    // global: esa solo avanzaba con sesiones de fuerza, así que con 2 días de
    // fuerza sobre 5 no se movía casi nunca y repetía el mismo día.
    // La cuenta vive en `diaSugeridoDeHoy` porque /entrenar tiene que sacar el
    // mismo número: cuando cada uno la hacía por su lado, no coincidían.
    const diaSugerido = diaSugeridoDeHoy(
      rutina,
      storage.getSesiones(),
      catalogo,
      hoy(),
      storage.getConfig(),
    );
    const diaElegido = parsearDiaElegido(sessionStorage.getItem(CLAVE_DIA), hoy(), rutina.dias.length);
    const elegidoAMano = resolverDiaDeHoy(rutina, diaSugerido, diaElegido);
    let dia: DiaRutina;
    let banner = '';
    if (retomando) {
      dia = estado.retomar!.sesionReducida!;
    } else if (elegidoAMano.esOverride) {
      // Elegiste vos: pisa la rotación y también la sesión combinada.
      dia = elegidoAMano.dia;
      banner = `<div class="aviso">Hoy hacés <strong>${escapar(dia.nombre)}</strong> en vez de ${escapar(rutina.dias[diaSugerido]?.nombre ?? 'lo que tocaba')}.
        <button class="boton-silencioso" id="btn-dia-volver">Volver a lo que tocaba</button></div>`;
    } else {
      // Sin banner de la rotación vieja. `resolverSalteo` solo avanza con
      // sesiones de fuerza, así que escribía cosas como "te quedó pendiente
      // Día 4 — Bici, la semana se corre un día" JUSTO ARRIBA de "hoy te toca
      // Elongación A": nombraba un día que no se iba a entrenar y anunciaba una
      // deuda que no existía (el carril cardio lleva su propia cuenta).
      // Lo que falta de verdad ya lo dice la tarjeta de la semana, por tipo.
      dia = elegidoAMano.dia;
    }

    const diaIndex = retomando ? 0 : elegidoAMano.diaIndex;
    const mostrado = modoSinGym ? convertirDiaSinGym(dia, catalogo, storage.getCustoms(), perfil) : { dia, avisos: [] };
    const editable = !retomando && !modoSinGym && dia === rutina.dias[diaIndex];

    // Qué se hace hoy y por qué: lo que tocaba por rotación, lo que elegiste vos
    // a mano, o la vuelta después de una pausa.
    const tituloDia = retomando
      ? 'Para volver'
      : elegidoAMano.esOverride
        ? 'Elegiste hacer'
        : 'Hoy te toca';

    caja.innerHTML = `
      ${htmlRespaldo()}
      ${htmlSemana(estados)}
      ${retomando || elegidoAMano.esOverride ? '' : htmlCarriles(estados, diaIndex)}
      ${banner}
      ${modoSinGym ? `<div class="aviso">Modo sin gym: variantes con tu cuerpo y banda por hoy. <button class="boton-silencioso" id="btn-singym-off">Volver</button></div>` : ''}
      ${htmlEncabezadoDia(tituloDia, mostrado.dia, rutina.dias.length > 1 && !retomando)}
      ${htmlSesion(mostrado.dia, mostrado.avisos, editable)}
      <button class="boton-principal" id="btn-hecha">Hecha ✓</button>
      <a class="boton boton-entrenar" href="${rutaBase}/entrenar/">${hayDraftHoy() ? 'Continuar entrenamiento ▸' : 'Entrenar ahora ▸'}</a>
      <button class="boton-secundario" id="btn-otra">Hice otra cosa</button>
      <details class="mas-opciones">
        <summary>Más opciones</summary>
        <div class="acciones-extra">
          <button id="btn-elongacion">+ Elongación</button>
          <button id="btn-singym">${modoSinGym ? 'Con equipo' : 'Hoy sin gym'}</button>
          <button id="btn-libre">Sesión libre</button>
          <button id="btn-retro">Registrar día pasado</button>
          <a class="boton" href="${rutaBase}/historial/#cardio">+ Cardio</a>
          <button id="btn-regenerar">Regenerar ↻</button>
        </div>
      </details>
      ${htmlBloques()}`;

    $('#btn-hecha').addEventListener('click', () => {
      const sesion = registrarHecha(rutina, diaIndex, catalogo, hoy());
      // El aviso mira el tipo de LO QUE SE VA A REGISTRAR. Estaba clavado en
      // 'fuerza', así que en elongación y cardio no saltaba nunca: registrabas
      // la elongación, volvías al home —que ya destacaba otro carril— y el
      // segundo tap guardaba un cardio que nunca hiciste, callado.
      if (yaHaySesion(storage.getSesiones(), hoy(), sesion.tipo)
        && !confirmar(`Ya registraste una sesión de ${ETIQUETA_TIPO[sesion.tipo]} hoy. ¿Agrego otra igual?`)) return;
      guardarYPedirRpe(retomando ? { ...sesion, diaRutina: dia.nombre } : sesion);
      sessionStorage.removeItem('ge:retomando');
    });
    $('#btn-respaldar')?.addEventListener('click', hacerRespaldo);
    $('#btn-respaldo-cerrar')?.addEventListener('click', () => {
      sessionStorage.setItem('ge:respaldoOculto', hoy());
      $('#aviso-respaldo')?.remove();
    });
    $('#btn-otra').addEventListener('click', () => panelOtraCosa(hoy()));
    caja.querySelectorAll('.editar').forEach((boton) =>
      boton.addEventListener('click', () => panelEditar(diaIndex, Number((boton as HTMLElement).dataset.idx))),
    );
    conectarBloques();
    $('#btn-retro').addEventListener('click', panelRetro);
    $('#btn-libre').addEventListener('click', () => {
      // Entrenar sin rutina: el wizard arranca vacío y se van sumando ejercicios.
      if (!limpiarDraftSiCambiaDia()) return;
      sessionStorage.setItem('ge:libre', hoy());
      navegar('/entrenar/');
    });
    $('#btn-otro-dia')?.addEventListener('click', () => panelElegirDia(rutina, diaSugerido, diaIndex));
    // Los tres carriles a un tap: tocar uno elige ESE día para hoy.
    //
    // La elección SIEMPRE queda escrita, también cuando coincide con el día
    // destacado. Antes ese caso era un atajo directo a /entrenar sin dejar
    // rastro, y el wizard terminaba resolviendo el día por su cuenta: tocabas
    // "Elongación A" y arrancaba el día de bici. Escribirlo siempre hace que la
    // elección viaje explícita en vez de depender de que las dos pantallas
    // calculen lo mismo.
    caja.querySelectorAll('[data-carril-dia]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const elegido = Number((boton as HTMLElement).dataset.carrilDia);
        // Solo si cambiás de día: el destacado puede tener un entrenamiento a
        // medias y tocarlo es continuarlo, no descartarlo.
        if (elegido !== diaIndex && !limpiarDraftSiCambiaDia()) return;
        sessionStorage.setItem(CLAVE_DIA, serializarDiaElegido(hoy(), elegido));
        if (elegido === diaIndex) {
          navegar('/entrenar/');
          return;
        }
        pintar();
      }),
    );
    $('#btn-dia-volver')?.addEventListener('click', () => {
      if (!limpiarDraftSiCambiaDia()) return;
      sessionStorage.removeItem(CLAVE_DIA);
      pintar();
    });
    $('#btn-singym').addEventListener('click', () => {
      modoSinGym = !modoSinGym;
      if (modoSinGym) sessionStorage.setItem('ge:singym', hoy());
      else sessionStorage.removeItem('ge:singym');
      pintar();
    });
    $('#btn-singym-off')?.addEventListener('click', () => {
      modoSinGym = false;
      sessionStorage.removeItem('ge:singym');
      pintar();
    });
    $('#btn-elongacion').addEventListener('click', () => {
      const sesionElong = generarElongacion(perfil, catalogo, Date.now() % 100000);
      const carta = document.createElement('div');
      carta.className = 'carta tipo-elongacion';
      carta.innerHTML = `${htmlSesion(sesionElong)}<button class="boton-principal">Elongación hecha ✓</button>
        <button class="boton-silencioso">Cerrar</button>`;
      carta.querySelector('.boton-principal')!.addEventListener('click', () => {
        storage.agregarSesion({ fecha: hoy(), tipo: 'elongacion', estado: 'hecha', diaRutina: 'Elongación' });
        carta.remove();
        pintar();
      });
      carta.querySelector('.boton-silencioso')!.addEventListener('click', () => carta.remove());
      caja.prepend(carta);
    });
    $('#btn-regenerar').addEventListener('click', () => {
      if (!confirmar('¿Regenero la rutina? Se cambian los ejercicios elegidos (mismo esquema).')) return;
      storage.setRutina(regenerar(rutina, catalogo, perfil));
      pintar();
    });
  }

  if (sessionStorage.getItem('ge:singym') !== hoy()) sessionStorage.removeItem('ge:singym');
  // Volver a Hoy sale del modo libre: si no, "Entrenar ahora" seguiría entrando ahí.
  sessionStorage.removeItem('ge:libre');
  if (sessionStorage.getItem('ge:respaldoOculto') !== hoy()) sessionStorage.removeItem('ge:respaldoOculto');
  if (sessionStorage.getItem('ge:retomando') !== hoy()) sessionStorage.removeItem('ge:retomando');
  const diasRutina = storage.getRutina()?.dias.length ?? 0;
  if (parsearDiaElegido(sessionStorage.getItem(CLAVE_DIA), hoy(), diasRutina) === null) {
    sessionStorage.removeItem(CLAVE_DIA);
  }
  pintar();
}
