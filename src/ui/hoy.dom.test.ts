// @vitest-environment jsdom
// Feature: la pantalla Hoy. Es la que más decisiones toma (rotación de días,
// modo retomar, día elegido a mano, registro de un tap, bloques, retroactivo)
// y hasta ahora era la única grande sin ningún test.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarHoy } from './hoy';
import { storage } from '../lib/storage';
import type { Ejercicio, Perfil, Rutina } from '../lib/tipos';

const HOY = '2026-07-20';

function ej(id: string, nombre: string, movimiento: string, grupo: Ejercicio['grupo']): Ejercicio {
  return {
    id, nombre_es: nombre, nombre_en: nombre, tipo: 'fuerza', grupo, equipment: 'x',
    zona: 'tren superior', musculo: 'pectorales', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const PRESS = ej('F1', 'Press banca', 'empuje-pectorales', 'pesas');
const PRESS_MAQ = ej('F2', 'Press en máquina', 'empuje-pectorales', 'maquina');
const REMO = ej('F4', 'Remo', 'traccion-dorsales', 'pesas');
const CATALOGO = [PRESS, PRESS_MAQ, REMO];

const PERFIL: Perfil = {
  edad: 45, dias: 3, nivel: 'entrenado', objetivo: 'musculo', equipamiento: ['pesas', 'maquina'],
};

function rutina(): Rutina {
  return {
    generadaEl: HOY,
    seed: 1,
    origen: 'reglas',
    dias: [
      {
        nombre: 'Día 1 — Empuje',
        enfoque: 'pecho',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
      {
        nombre: 'Día 2 — Espalda',
        enfoque: 'dorsales',
        ejercicios: [
          { movimiento: 'traccion-dorsales', ejercicioId: 'F4', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
    ],
  };
}

function montar(respuestas: boolean[] = [], respaldos: Array<'compartido' | 'descargado' | 'cancelado'> = []) {
  document.body.innerHTML = '<div id="hoy"></div>';
  const preguntas: string[] = [];
  const rutas: string[] = [];
  const respaldadas: string[] = [];
  let i = 0;
  let r = 0;
  montarHoy({
    contenedor: document.querySelector('#hoy') as HTMLElement,
    catalogo: CATALOGO,
    perfil: PERFIL,
    hoy: () => HOY,
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
    navegar: (ruta) => rutas.push(ruta),
    respaldar: async (h) => {
      respaldadas.push(h);
      return respaldos[r++] ?? 'compartido';
    },
  });
  return { preguntas, rutas, respaldadas };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const texto = () => $('#hoy').textContent!;

beforeEach(() => {
  // jsdom no implementa scrollTo y avisa por consola en cada panel que se abre.
  window.scrollTo = () => {};
  localStorage.clear();
  sessionStorage.clear();
  storage.setPerfil(PERFIL);
  storage.setRutina(rutina());
});

describe('la sesión de hoy', () => {
  it('muestra el día que toca con sus ejercicios', () => {
    montar();
    expect(texto()).toContain('Día 1 — Empuje');
    expect(texto()).toContain('Press banca');
  });

  // La métrica dejó de ser un número único: son tres casilleros por tipo. El
  // agregado mostraba verde cinco semanas seguidas mientras la elongación
  // llegaba a 1 de 4 semanas.
  it('muestra la meta de la semana por tipo, no un número único', () => {
    montar();
    expect($$('.fila-meta')).toHaveLength(3);
    expect(texto()).toContain('Fuerza');
    expect(texto()).toContain('Cardio');
    expect(texto()).toContain('Elongación');
    expect($('[data-meta="fuerza"] .conteo').textContent).toBe('0/2');
  });

  it('encabeza con la fecha de hoy y una frase de contexto', () => {
    montar();
    expect(texto()).toContain('Lunes 20 de julio');
    expect($('.semana .frase').textContent).toBeTruthy();
  });

  it('la insignia de racha aparece recién con 2 semanas cumplidas', () => {
    montar();
    expect($('.insignia')).toBeNull();

    for (const fecha of ['2026-07-06', '2026-07-08', '2026-07-10', '2026-07-13', '2026-07-15', '2026-07-17']) {
      storage.agregarSesion({ fecha, tipo: 'fuerza', estado: 'hecha' });
    }
    montar();
    expect($('.insignia').textContent).toContain('2');
  });

  it('recién con rutina y sin respaldo previo aparece el recordatorio', () => {
    montar();
    expect($('#aviso-respaldo')).not.toBeNull();
    expect(texto()).toMatch(/este teléfono/i);
  });

  it('no molesta si respaldaste hace poco', () => {
    localStorage.setItem('ge:ultimoBackup', HOY);
    montar();
    expect($('#aviso-respaldo')).toBeNull();
  });

  it('avisa recién pasado el umbral de días', () => {
    localStorage.setItem('ge:ultimoBackup', '2026-07-17'); // 3 días
    montar();
    expect($('#aviso-respaldo')).toBeNull();
    localStorage.setItem('ge:ultimoBackup', '2026-07-10'); // 10 días
    montar();
    expect($('#aviso-respaldo')).not.toBeNull();
  });

  it('respaldar corta el aviso y confirma', async () => {
    const { respaldadas } = montar();
    $('#btn-respaldar').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(respaldadas).toEqual([HOY]);
    expect($('#aviso-respaldo')?.className).toContain('ok');
    expect(texto()).toMatch(/copia enviada/i);
  });

  it('si cancelás el compartir, el aviso sigue para reintentar', async () => {
    const { respaldadas } = montar([], ['cancelado']);
    $('#btn-respaldar').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(respaldadas).toEqual([HOY]);
    expect($('#aviso-respaldo')?.className).not.toContain('ok');
    expect(($('#btn-respaldar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('"Ahora no" esconde el recordatorio por hoy', () => {
    montar();
    $('#btn-respaldo-cerrar').click();
    expect($('#aviso-respaldo')).toBeNull();
    montar(); // se vuelve a montar el mismo día
    expect($('#aviso-respaldo')).toBeNull();
  });

  it('deja a la vista los tres caminos y guarda el resto en Más opciones', () => {
    montar();
    const detalle = $('.mas-opciones') as HTMLDetailsElement;
    expect(detalle.open).toBe(false);
    // Registrar y entrenar no pueden costar un tap extra.
    for (const sel of ['#btn-hecha', '#btn-otra', '.boton-entrenar']) {
      expect($(sel).closest('.mas-opciones')).toBeNull();
    }
    expect($('#btn-regenerar').closest('.mas-opciones')).toBe(detalle);
  });

  it('sin rutina ofrece armarla', () => {
    localStorage.removeItem('ge:rutina');
    montar();
    expect(texto()).toContain('Todavía no hay rutina');
  });

  it('si nunca lo hiciste lo dice', () => {
    montar();
    expect(texto()).toContain('Nunca lo hiciste');
  });

  it('muestra la última vez con kg y lb', () => {
    storage.agregarSesion({
      fecha: '2026-07-18', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }],
    });
    montar();
    expect(texto()).toContain('20 kg · 44,1 lb');
  });
});

describe('registrar de un tap', () => {
  it('"Hecha ✓" guarda la sesión del día que tocaba', () => {
    montar();
    $('#btn-hecha').click();
    const s = storage.getSesiones()[0]!;
    expect(s.tipo).toBe('fuerza');
    expect(s.diaIndex).toBe(0);
    expect(s.fecha).toBe(HOY);
  });

  it('después de guardar ofrece el RPE, que es opcional', () => {
    montar();
    $('#btn-hecha').click();
    expect(texto()).toContain('¿Qué tan dura estuvo?');
    $('[data-rpe="8"]').click();
    expect(storage.getSesiones()[0]!.rpe).toBe(8);
  });

  it('avisa si ya registraste una de fuerza hoy', () => {
    storage.agregarSesion({ fecha: HOY, tipo: 'fuerza', estado: 'hecha' });
    const { preguntas } = montar([false]);
    $('#btn-hecha').click();
    expect(preguntas[0]).toContain('Ya registraste una sesión de fuerza hoy');
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('"Hice otra cosa" registra tipo y duración', () => {
    montar();
    $('#btn-otra').click();
    $('[data-tipo="caminata"]').click();
    ($('#hoy input[type="number"]') as HTMLInputElement).value = '45';
    $('#hoy .boton-principal').click();
    const s = storage.getSesiones()[0]!;
    expect(s.estado).toBe('otra');
    expect(s.duracionMin).toBe(45);
  });
});

describe('hacer otro día', () => {
  it('dice cuál te toca hoy con todas las letras', () => {
    montar();
    const encabezado = $('.dia-hoy');
    expect(encabezado.textContent).toContain('Hoy te toca');
    expect(encabezado.textContent).toContain('Día 1 — Empuje');
  });

  it('cambiar de día está a la vista, no dentro de Más opciones', () => {
    montar();
    expect($('#btn-otro-dia').closest('.mas-opciones')).toBeNull();
    expect($('#btn-otro-dia').closest('.dia-hoy')).not.toBeNull();
  });

  it('al elegir otro día el encabezado dice que lo elegiste vos', () => {
    montar();
    $('#btn-otro-dia').click();
    $('[data-dia="1"]').click();
    expect($('.dia-hoy').textContent).toContain('Elegiste hacer');
    expect($('.dia-hoy').textContent).toContain('Día 2 — Espalda');
  });

  it('lista los días y marca cuál tocaba', () => {
    montar();
    $('#btn-otro-dia').click();
    expect(texto()).toContain('¿Qué querés hacer hoy?');
    expect(texto()).toContain('te tocaba hoy');
  });

  it('elegir otro día cambia la sesión de hoy sin tocar la rutina', () => {
    montar();
    $('#btn-otro-dia').click();
    $('[data-dia="1"]').click();
    expect(texto()).toContain('Día 2 — Espalda');
    expect(texto()).toContain('en vez de Día 1');
    expect(storage.getRutina()!.dias[0]!.nombre).toBe('Día 1 — Empuje');
  });

  it('lo registrado queda con el día que realmente hiciste', () => {
    montar();
    $('#btn-otro-dia').click();
    $('[data-dia="1"]').click();
    $('#btn-hecha').click();
    expect(storage.getSesiones()[0]!.diaIndex).toBe(1);
  });

  it('se puede volver a lo que tocaba', () => {
    montar();
    $('#btn-otro-dia').click();
    $('[data-dia="1"]').click();
    $('#btn-dia-volver').click();
    expect(texto()).toContain('Día 1 — Empuje');
  });

  it('si hay un entrenamiento a medias, avisa antes de descartarlo', () => {
    localStorage.setItem('ge:draft', JSON.stringify({ fecha: HOY, ejercicios: [] }));
    const { preguntas } = montar([false]);
    $('#btn-otro-dia').click();
    $('[data-dia="1"]').click();
    expect(preguntas[0]).toContain('entrenamiento a medias');
    expect(localStorage.getItem('ge:draft')).not.toBeNull();
  });
});

describe('editar un ejercicio desde Hoy', () => {
  it('usa el mismo panel que Rutina, con descanso incluido', () => {
    montar();
    $('.editar').click();
    // El panel de Hoy no tenía descanso ni buscador antes de unificarlos.
    expect($('[data-campo="descansoSeg"]')).not.toBeNull();
    expect($('#buscar-ej')).not.toBeNull();
  });

  it('sustituye y cambia la dosis en la rutina', () => {
    montar();
    $('.editar').click();
    $('[data-elegir="F2"]').click();
    ($('[data-campo="series"]') as HTMLInputElement).value = '4';
    $('[data-accion="guardar"]').click();
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]).toMatchObject({ ejercicioId: 'F2', series: 4 });
  });

  it('quitar pregunta antes', () => {
    const { preguntas } = montar([true]);
    $('.editar').click();
    $('[data-accion="quitar"]').click();
    expect(preguntas[0]).toContain('¿Saco este ejercicio del día?');
    expect(storage.getRutina()!.dias[0]!.ejercicios).toHaveLength(0);
  });
});

describe('modo sin gym', () => {
  it('cambia a variantes sin equipo y se puede volver', () => {
    montar();
    $('#btn-singym').click();
    expect(texto()).toContain('Modo sin gym');
    $('#btn-singym-off').click();
    expect(texto()).not.toContain('Modo sin gym');
  });
});

describe('registrar un día pasado', () => {
  it('rechaza una fecha de más de 7 días', () => {
    montar();
    $('#btn-retro').click();
    ($('#hoy input[type="date"]') as HTMLInputElement).value = '2026-06-01';
    $('[data-accion="hecha"]').click();
    expect(texto()).toContain('últimos 7 días');
    expect(storage.getSesiones()).toHaveLength(0);
  });

  it('registra la sesión que tocaba ese día', () => {
    montar();
    $('#btn-retro').click();
    ($('#hoy input[type="date"]') as HTMLInputElement).value = '2026-07-18';
    $('[data-accion="hecha"]').click();
    expect(storage.getSesiones()[0]!.fecha).toBe('2026-07-18');
  });
});

describe('bloques guardados', () => {
  it('registra el bloque completo de un tap', () => {
    storage.setGrupos([
      {
        nombre: 'Movilidad de hombro',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 2, repsMin: 10, repsMax: 10, descansoSeg: 30 },
        ],
      },
    ]);
    montar();
    expect(texto()).toContain('Movilidad de hombro');
    $('[data-bloque="0"]').click();
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('quitar un bloque pregunta antes', () => {
    storage.setGrupos([{ nombre: 'Bloque X', ejercicios: [] }]);
    const { preguntas } = montar([true]);
    $('[data-quitar-bloque="0"]').click();
    expect(preguntas[0]).toContain('Bloque X');
    expect(storage.getGrupos()).toHaveLength(0);
  });
});

describe('sesión libre', () => {
  it('el botón marca el modo y lleva al wizard', () => {
    const { rutas } = montar();
    $('#btn-libre').click();
    expect(sessionStorage.getItem('ge:libre')).toBe(HOY);
    expect(rutas).toEqual(['/entrenar/']);
  });

  it('con un entrenamiento a medias avisa antes', () => {
    localStorage.setItem('ge:draft', JSON.stringify({ fecha: HOY, ejercicios: [] }));
    const { preguntas, rutas } = montar([false]);
    $('#btn-libre').click();
    expect(preguntas[0]).toContain('entrenamiento a medias');
    expect(rutas).toEqual([]);
    expect(sessionStorage.getItem('ge:libre')).toBeNull();
  });

  it('volver a Hoy sale del modo libre', () => {
    sessionStorage.setItem('ge:libre', HOY);
    montar();
    expect(sessionStorage.getItem('ge:libre')).toBeNull();
  });
});

// Carriles por tipo. El home dejaba de servir por dos motivos a la vez: la
// rotación solo avanzaba con sesiones de fuerza (así que con 2 días de fuerza
// sobre 5 repetía el mismo día), y la meta única mostraba verde mientras el
// desbalance entre cardio y elongación era de 8 a 1.
describe('carriles por tipo', () => {
  // El fixture de arriba es todo de fuerza; acá hace falta una rutina con los
  // tres tipos, como la real de JFD.
  const BICI: Ejercicio = { ...ej('C1', 'Bici zona 2', 'otro-sistema-cardiovascular', 'maquina'), tipo: 'cardio' };
  const ESTIRAR: Ejercicio = { ...ej('S1', 'Isquios', 'elongacion-isquios', 'cuerpo'), tipo: 'elongacion' };
  const CAT3 = [...CATALOGO, BICI, ESTIRAR];
  const p = (id: string) => ({ movimiento: 'm', ejercicioId: id, series: 2, repsMin: 10, repsMax: 12, descansoSeg: 60 });

  function montar3() {
    storage.setRutina({
      generadaEl: HOY, seed: 1, origen: 'ia',
      dias: [
        { nombre: 'Día 1 — Fuerza A', enfoque: 'x', ejercicios: [p('F1')] },
        { nombre: 'Día 2 — Zona 2', enfoque: 'x', ejercicios: [p('C1'), p('S1')] },
        { nombre: 'Día 3 — Fuerza B', enfoque: 'x', ejercicios: [p('F4')] },
        { nombre: 'Día 4 — Bici', enfoque: 'x', ejercicios: [p('C1')] },
        { nombre: 'Elongación (mañanas)', enfoque: 'x', ejercicios: [p('S1')] },
      ],
    });
    document.body.innerHTML = '<div id="hoy"></div>';
    const rutas: string[] = [];
    montarHoy({
      contenedor: document.querySelector('#hoy') as HTMLElement,
      catalogo: CAT3, perfil: PERFIL, hoy: () => HOY,
      confirmar: () => true, navegar: (r) => rutas.push(r),
      respaldar: async () => 'compartido',
    });
    return { rutas };
  }

  it('ofrece los tres carriles en vez de dar una sola orden', () => {
    montar3();
    expect($$('.carril')).toHaveLength(3);
    expect($$('.carril').length).toBeGreaterThanOrEqual(1);
    expect(texto()).toContain('¿Qué hacés hoy?');
  });

  // Tocar el carril destacado era un atajo a /entrenar SIN dejar rastro de la
  // elección, y el wizard terminaba resolviendo el día por su cuenta. La
  // elección tiene que viajar escrita, no depender de que las dos pantallas
  // calculen el mismo número.
  it('tocar el carril destacado deja escrito qué día elegiste', () => {
    const { rutas } = montar3();
    const destacado = $$('.carril').find((c) => c.className.includes('destacado'))!;
    const dia = Number(destacado.dataset.carrilDia);
    destacado.click();
    expect(JSON.parse(sessionStorage.getItem('ge:dia')!)).toEqual({ fecha: HOY, diaIndex: dia });
    expect(rutas).toContain('/entrenar/');
  });

  it('tocar otro carril también lo deja escrito', () => {
    montar3();
    const otro = $$('.carril').find((c) => !c.className.includes('destacado'))!;
    const dia = Number(otro.dataset.carrilDia);
    otro.click();
    expect(JSON.parse(sessionStorage.getItem('ge:dia')!).diaIndex).toBe(dia);
  });

  it('el más atrasado va arriba', () => {
    // Elongación al día (meta 3), fuerza con una hecha, cardio en cero: el
    // cardio tiene que encabezar por ser el que más debe.
    storage.setSesiones([
      { fecha: '2026-07-20', tipo: 'fuerza', estado: 'hecha', diaIndex: 0 },
      { fecha: '2026-07-20', tipo: 'elongacion', estado: 'hecha', diaIndex: 4 },
      { fecha: '2026-07-21', tipo: 'elongacion', estado: 'hecha', diaIndex: 4 },
      { fecha: '2026-07-22', tipo: 'elongacion', estado: 'hecha', diaIndex: 4 },
    ]);
    montar3();
    expect($$('.carril')[0]!.className).toContain('tipo-cardio');
    expect($$('.carril')[2]!.className).toContain('tipo-elongacion');
  });

  it('cada carril muestra hace cuánto y cómo viene la semana', () => {
    // HOY es lunes: una sesión del domingo es de la semana pasada y por eso
    // dice "ayer" pero no suma al casillero de esta semana.
    storage.setSesiones([
      { fecha: '2026-07-19', tipo: 'cardio', estado: 'hecha', diaIndex: 1 },
    ]);
    montar3();
    let cardio = $$('.carril').find((c) => c.className.includes('tipo-cardio'))!;
    expect(cardio.textContent).toContain('ayer');
    expect(cardio.textContent).toContain('0 de 2 esta semana');

    storage.setSesiones([
      { fecha: '2026-07-19', tipo: 'cardio', estado: 'hecha', diaIndex: 1 },
      { fecha: HOY, tipo: 'cardio', estado: 'hecha', diaIndex: 3 },
    ]);
    montar3();
    cardio = $$('.carril').find((c) => c.className.includes('tipo-cardio'))!;
    expect(cardio.textContent).toContain('hoy');
    expect(cardio.textContent).toContain('1 de 2 esta semana');
  });

  it('tocar un carril elige ese día para hoy', () => {
    montar3();
    const cardio = $$('.carril').find((c) => c.className.includes('tipo-cardio'))!;
    const dia = cardio.dataset.carrilDia!;
    cardio.click();
    expect(sessionStorage.getItem('ge:dia')).toContain(dia);
  });

  // EL BUG: hacer cardio no movía la rotación porque resolverSalteo solo
  // miraba sesiones de tipo 'fuerza'. JFD hizo zona 2 y la app le volvió a
  // proponer el mismo día.
  it('hacer cardio avanza el carril de cardio', () => {
    montar3();
    const antes = $$('.carril').find((c) => c.className.includes('tipo-cardio'))!.dataset.carrilDia;
    storage.setSesiones([
      { fecha: '2026-07-20', tipo: 'cardio', estado: 'hecha', diaIndex: Number(antes) },
    ]);
    montar3();
    const despues = $$('.carril').find((c) => c.className.includes('tipo-cardio'))!.dataset.carrilDia;
    expect(despues).not.toBe(antes);
  });

  it('una sesión con todo salteado no llena el casillero', () => {
    storage.setSesiones([
      {
        fecha: '2026-07-20', tipo: 'fuerza', estado: 'hecha', diaIndex: 0,
        items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }],
      },
    ]);
    montar3();
    expect($('[data-meta="fuerza"] .conteo').textContent).toBe('0/2');
  });

  it('el resumen nombra lo que falta sin reprochar nada', () => {
    montar3();
    const frase = $('.semana .frase').textContent!;
    expect(frase).toContain('falta');
    expect(frase).not.toContain('no hiciste');
  });
});
