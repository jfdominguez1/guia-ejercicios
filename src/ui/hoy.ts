// Pantalla Hoy: la métrica de la semana, la sesión que toca, el registro de un
// tap y todos los atajos (otro día, sin gym, elongación, bloques, retroactivo).
// Es la pantalla que más decisiones toma; vive acá y no en el .astro para poder
// testearla con jsdom.

import { resolverSalteo, generarElongacion, regenerar, ultimaVezMovimiento } from '../lib/motor';
import { actualizarDosis, quitarEjercicio, sustituirEjercicio } from '../lib/editor';
import { opcionesDeDia, parsearDiaElegido, resolverDiaDeHoy, serializarDiaElegido } from '../lib/dia';
import { estadoHome, type ResultadoRetomar } from '../lib/retomar';
import { registrarHecha, registrarOtra, registrarGrupo, fechaValidaRetro, resumenSemanal, yaHaySesion, type TipoRapido } from '../lib/registro';
import { convertirDiaSinGym } from '../lib/singym';
import { formatearObjetivo, formatearFc, etiquetaDescanso } from '../lib/formato';
import { resumenSeries } from '../lib/unidades';
import { storage } from '../lib/storage';
import { crearPanelEjercicio } from './panel-ejercicio';
import { escapar, haceDias, rutaBase } from './datos';
import type { DiaRutina, Ejercicio, Perfil, Rutina, Sesion } from '../lib/tipos';

export interface DepsHoy {
  contenedor: HTMLElement;
  catalogo: Ejercicio[];
  perfil: Perfil;
  hoy: () => string;
  confirmar: (mensaje: string) => boolean;
}

/** Día elegido a mano para hoy (pisa la rotación). Vale solo por hoy. */
const CLAVE_DIA = 'ge:dia';

export function montarHoy(deps: DepsHoy): void {
  const { contenedor: caja, catalogo, perfil, hoy, confirmar } = deps;
  const $ = <T extends HTMLElement>(sel: string) => caja.querySelector(sel) as T;
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

  function htmlSemana(): string {
    const config = storage.getConfig();
    const r = resumenSemanal(storage.getSesiones(), hoy(), config.objetivoSemanal);
    const discos = Array.from(
      { length: Math.max(r.objetivo, Math.min(r.hechas, 7)) },
      (_, i) => `<div class="disco${i < r.hechas ? ' lleno' : ''}"></div>`,
    ).join('');
    return `<div class="carta semana">
      <span class="eyebrow">Esta semana</span>
      <div class="numero">${r.hechas} de ${r.objetivo}</div>
      <div class="discos">${discos}</div>
    </div>`;
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

  function htmlSesion(dia: DiaRutina, avisos: string[] = [], editable = false): string {
    return `<div class="carta">
      <span class="eyebrow">${escapar(dia.enfoque)}</span>
      <h2 style="margin-top:2px">${escapar(dia.nombre)}</h2>
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

  function guardarYPedirRpe(sesion: Sesion) {
    storage.agregarSesion(sesion);
    pintar();
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
        const salteo = rutina ? resolverSalteo(rutina, storage.getSesiones(), fecha) : null;
        if (rutina && salteo) {
          storage.agregarSesion(registrarHecha(rutina, salteo.diaIndex, catalogo, fecha));
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
      caja.innerHTML = `${htmlSemana()}<div class="carta"><p>Todavía no hay rutina.</p>
        <a class="boton-principal" style="display:block;text-align:center;text-decoration:none" href="${rutaBase}/perfil/">Armar mi rutina</a></div>`;
      return;
    }
    const sesiones = storage.getSesiones();
    const config = storage.getConfig();
    const estado = estadoHome(rutina, sesiones, hoy(), config, catalogo);

    // Modo retomar: una sola cosa en pantalla. Cero culpa.
    if (estado.modo === 'retomar' && !sessionStorage.getItem('ge:retomando')) {
      caja.innerHTML = htmlSemana() + htmlRetomar(estado.retomar!);
      $('#btn-retomar')?.addEventListener('click', () => {
        sessionStorage.setItem('ge:retomando', hoy());
        pintar();
      });
      return;
    }

    const retomando = estado.modo === 'retomar' && estado.retomar?.sesionReducida;
    const salteo = estado.salteo;
    const diaSugerido = salteo?.diaIndex ?? 0;
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
    } else if (salteo && salteo.tipo === 'combinada' && salteo.ejercicios?.length && !sessionStorage.getItem('ge:sinCombinada')) {
      dia = { nombre: 'Sesión combinada', enfoque: 'lo esencial de lo que quedó', ejercicios: salteo.ejercicios };
      banner = `<div class="aviso">${escapar(salteo.mensaje)} <button class="boton-silencioso" id="btn-dejar-pasar">Seguir normal</button></div>`;
    } else {
      dia = elegidoAMano.dia;
      if (salteo && salteo.tipo !== 'normal') banner = `<div class="aviso">${escapar(salteo.mensaje)}</div>`;
    }

    const diaIndex = retomando ? 0 : elegidoAMano.diaIndex;
    const mostrado = modoSinGym ? convertirDiaSinGym(dia, catalogo, storage.getCustoms(), perfil) : { dia, avisos: [] };
    const editable = !retomando && !modoSinGym && dia === rutina.dias[diaIndex];

    caja.innerHTML = `
      ${htmlSemana()}
      ${banner}
      ${modoSinGym ? `<div class="aviso">Modo sin gym: variantes con tu cuerpo y banda por hoy. <button class="boton-silencioso" id="btn-singym-off">Volver</button></div>` : ''}
      ${htmlSesion(mostrado.dia, mostrado.avisos, editable)}
      <button class="boton-principal" id="btn-hecha">Hecha ✓</button>
      <button class="boton-secundario" id="btn-otra">Hice otra cosa</button>
      <div class="acciones-extra">
        <a class="boton" style="text-align:center;text-decoration:none" href="${rutaBase}/entrenar/">${hayDraftHoy() ? 'Continuar entrenamiento ▸' : 'Entrenar ahora'}</a>
        <button id="btn-elongacion">+ Elongación</button>
        <button id="btn-singym">${modoSinGym ? 'Con equipo' : 'Hoy sin gym'}</button>
        ${rutina.dias.length > 1 ? '<button id="btn-otro-dia">Hacer otro día ⇄</button>' : ''}
        <button id="btn-retro">Registrar día pasado</button>
        <a class="boton" style="text-align:center;text-decoration:none" href="${rutaBase}/historial/#cardio">+ Cardio</a>
        <button id="btn-regenerar">Regenerar ↻</button>
      </div>
      ${htmlBloques()}`;

    $('#btn-hecha').addEventListener('click', () => {
      // Dos taps por error meten dos sesiones y le mienten al número de la semana.
      if (yaHaySesion(storage.getSesiones(), hoy(), 'fuerza')
        && !confirmar('Ya registraste una sesión de fuerza hoy. ¿Agrego otra igual?')) return;
      const sesion = registrarHecha(rutina, diaIndex, catalogo, hoy());
      guardarYPedirRpe(retomando || dia.nombre === 'Sesión combinada' ? { ...sesion, diaRutina: dia.nombre } : sesion);
      sessionStorage.removeItem('ge:retomando');
    });
    $('#btn-otra').addEventListener('click', () => panelOtraCosa(hoy()));
    caja.querySelectorAll('.editar').forEach((boton) =>
      boton.addEventListener('click', () => panelEditar(diaIndex, Number((boton as HTMLElement).dataset.idx))),
    );
    conectarBloques();
    $('#btn-retro').addEventListener('click', panelRetro);
    $('#btn-otro-dia')?.addEventListener('click', () => panelElegirDia(rutina, diaSugerido, diaIndex));
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
    $('#btn-dejar-pasar')?.addEventListener('click', () => {
      sessionStorage.setItem('ge:sinCombinada', hoy());
      pintar();
    });
    $('#btn-regenerar').addEventListener('click', () => {
      if (!confirmar('¿Regenero la rutina? Se cambian los ejercicios elegidos (mismo esquema).')) return;
      storage.setRutina(regenerar(rutina, catalogo, perfil));
      pintar();
    });
  }

  if (sessionStorage.getItem('ge:singym') !== hoy()) sessionStorage.removeItem('ge:singym');
  if (sessionStorage.getItem('ge:sinCombinada') !== hoy()) sessionStorage.removeItem('ge:sinCombinada');
  if (sessionStorage.getItem('ge:retomando') !== hoy()) sessionStorage.removeItem('ge:retomando');
  const diasRutina = storage.getRutina()?.dias.length ?? 0;
  if (parsearDiaElegido(sessionStorage.getItem(CLAVE_DIA), hoy(), diasRutina) === null) {
    sessionStorage.removeItem(CLAVE_DIA);
  }
  pintar();
}
