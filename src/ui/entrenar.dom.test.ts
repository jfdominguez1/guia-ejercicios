// @vitest-environment jsdom
// Feature: el wizard de entrenamiento de punta a punta. Es la pantalla donde
// más tiempo se pasa y la que más estado maneja (draft, swaps, salteos), así
// que se ejercita con el DOM real y no solo su lógica.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarEntrenar } from './entrenar';
import { storage } from '../lib/storage';
import type { Ejercicio, Perfil, Rutina } from '../lib/tipos';

const HOY = '2026-07-20';

function ej(id: string, nombre: string, movimiento: string, grupo: Ejercicio['grupo'], musculo = 'pectorales'): Ejercicio {
  return {
    id, nombre_es: nombre, nombre_en: nombre, tipo: 'fuerza', grupo, equipment: 'x',
    zona: 'tren superior', musculo, secundarios: [], pasos: ['Paso uno'], movimiento, basico: true,
  };
}

const PRESS = ej('F1', 'Press banca', 'empuje-pectorales', 'pesas');
const PRESS_MAQ = ej('F2', 'Press en máquina', 'empuje-pectorales', 'maquina');
const APERTURA = ej('F3', 'Aperturas', 'apertura-pectorales', 'pesas');
const REMO = ej('F4', 'Remo', 'traccion-dorsales', 'pesas', 'dorsales');
const CATALOGO = [PRESS, PRESS_MAQ, APERTURA, REMO];

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
        enfoque: 'pecho y hombros',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 2, repsMin: 8, repsMax: 12, descansoSeg: 90, pesoInicialKg: 25 },
          { movimiento: 'traccion-dorsales', ejercicioId: 'F4', series: 2, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
      { nombre: 'Día 2 — Piernas', enfoque: 'piernas', ejercicios: [] },
    ],
  };
}

function montar(respuestas: boolean[] = []) {
  document.body.innerHTML = '<div id="wizard"></div>';
  const rutas: string[] = [];
  const preguntas: string[] = [];
  let i = 0;
  montarEntrenar({
    contenedor: document.querySelector('#wizard') as HTMLElement,
    catalogo: CATALOGO,
    perfil: PERFIL,
    hoy: () => HOY,
    navegar: (ruta) => rutas.push(ruta),
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
  });
  return { rutas, preguntas };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const texto = () => $('#wizard').textContent!;
const leerDraft = () => JSON.parse(localStorage.getItem('ge:draft')!);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  storage.setPerfil(PERFIL);
  storage.setRutina(rutina());
});

describe('arranque', () => {
  it('muestra el primer ejercicio del día con su objetivo y progreso', () => {
    montar();
    expect(texto()).toContain('Press banca');
    expect(texto()).toContain('Día 1 — Empuje');
    expect(texto()).toContain('1/2');
    expect(texto()).toContain('Objetivo: 2×');
  });

  it('sin rutina manda al perfil en vez de romper', () => {
    localStorage.removeItem('ge:rutina');
    const { rutas } = montar();
    expect(rutas).toEqual(['/perfil/']);
  });

  it('arranca una serie por cada serie planificada', () => {
    montar();
    expect($$('.serie')).toHaveLength(2);
  });
});

describe('marcar series', () => {
  it('tocar el círculo marca la serie y queda en el draft', () => {
    montar();
    $$('.serie .check')[0]!.click();
    expect($$('.serie')[0]!.className).toContain('hecha');
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(true);
  });

  it('tocarlo de nuevo la desmarca', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $$('.serie .check')[0]!.click();
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(false);
  });

  it('el peso tipeado se guarda en el draft', () => {
    montar();
    const peso = $$('.serie [data-campo="peso"]')[0] as HTMLInputElement;
    peso.value = '22.5';
    peso.dispatchEvent(new Event('change'));
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5);
  });
});

describe('navegación', () => {
  it('Siguiente pasa al segundo ejercicio', () => {
    montar();
    $('#btn-siguiente').click();
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
  });

  it('Anterior vuelve, y en el primero está deshabilitado', () => {
    montar();
    expect(($('#btn-anterior') as HTMLButtonElement).disabled).toBe(true);
    $('#btn-siguiente').click();
    $('#btn-anterior').click();
    expect(texto()).toContain('Press banca');
  });

  it('después del último ejercicio aparece el resumen', () => {
    montar();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    expect(texto()).toContain('¡Terminaste!');
  });
});

describe('saltear', () => {
  it('saltea y avanza al siguiente', () => {
    montar();
    $('#btn-saltear').click();
    expect(texto()).toContain('Remo');
    expect(leerDraft().ejercicios[0].salteado).toBe(true);
  });

  it('el salteado aparece en el resumen y se guarda como salteado', () => {
    const { rutas } = montar();
    $('#btn-saltear').click();
    $('#btn-siguiente').click();
    expect(texto()).toContain('1 salteado');
    $('#btn-guardar').click();
    const items = storage.getSesiones()[0]!.items!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ejercicioId: 'F1', salteado: true });
    expect(rutas).toEqual(['/']);
  });
});

describe('cambiar ejercicio', () => {
  it('ofrece el equivalente de otro implemento y el del mismo músculo', () => {
    montar();
    $('#btn-cambiar').click();
    expect(texto()).toContain('Press en máquina'); // mismo movimiento
    expect(texto()).toContain('Aperturas'); // mismo músculo
    expect(texto()).not.toContain('Remo'); // otro músculo: no se ofrece
  });

  it('buscar en el catálogo filtra por nombre', () => {
    montar();
    $('#btn-cambiar').click();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'remo';
    buscador.dispatchEvent(new Event('input'));
    expect(texto()).toContain('Remo');
  });

  it('"solo por hoy" cambia el wizard pero NO la rutina', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    expect(texto()).toContain('¿Hasta cuándo?');
    $('[data-alcance="hoy"]').click();
    expect(texto()).toContain('Press en máquina');
    expect(texto()).toContain('en lugar de Press banca');
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
  });

  it('"cambiarlo en la rutina" sí la modifica', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    $('[data-alcance="siempre"]').click();
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F2');
    // Ya es el ejercicio de la rutina: no se muestra como reemplazo temporal.
    expect(texto()).not.toContain('en lugar de');
  });

  it('volver sin cambiar deja todo como estaba', () => {
    montar();
    $('#btn-cambiar').click();
    $('#btn-cancelar-cambio').click();
    expect(texto()).toContain('Press banca');
    expect(storage.getRutina()!.dias[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
  });

  it('el cambio por hoy queda registrado como enLugarDe en la sesión', () => {
    montar();
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    $('[data-alcance="hoy"]').click();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]).toMatchObject({ ejercicioId: 'F2', enLugarDe: 'F1' });
  });
});

describe('guardar la sesión', () => {
  it('guarda solo las series marcadas y limpia el draft', () => {
    const { rutas } = montar();
    $$('.serie .check')[0]!.click(); // solo la primera serie
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.items).toHaveLength(1);
    expect(sesion.items![0]!.series).toHaveLength(1);
    expect(sesion.diaRutina).toBe('Día 1 — Empuje');
    expect(sesion.diaIndex).toBe(0);
    expect(localStorage.getItem('ge:draft')).toBeNull();
    expect(rutas).toEqual(['/']);
  });

  it('sin nada marcado igual registra la sesión, sin items', () => {
    montar();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.estado).toBe('hecha');
    expect(sesion.items).toBeUndefined();
  });
});

describe('draft', () => {
  it('al volver a entrar retoma donde estabas', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    montar(); // simula recargar la página
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
  });

  it('si la rutina cambió de largo, el draft viejo se descarta', () => {
    montar();
    $('#btn-siguiente').click();
    const r = rutina();
    r.dias[0]!.ejercicios.pop();
    storage.setRutina(r);
    montar();
    expect(texto()).toContain('1/1');
    expect(texto()).toContain('Press banca');
  });
});

describe('día elegido a mano', () => {
  it('respeta el override de "hacer otro día"', () => {
    const r = rutina();
    r.dias[1]!.ejercicios = [
      { movimiento: 'traccion-dorsales', ejercicioId: 'F4', series: 1, repsMin: 8, repsMax: 12, descansoSeg: 90 },
    ];
    storage.setRutina(r);
    sessionStorage.setItem('ge:dia', JSON.stringify({ fecha: HOY, diaIndex: 1 }));
    montar();
    expect(texto()).toContain('Día 2 — Piernas');
    expect(texto()).toContain('Remo');
  });
});

describe('kg y libras', () => {
  const peso = (i = 0) => $$('.serie [data-campo="peso"]')[i] as HTMLInputElement;
  const tipearPeso = (valor: string, i = 0) => {
    peso(i).value = valor;
    peso(i).dispatchEvent(new Event('change'));
  };

  it('muestra la referencia de la última vez en kg Y en lb', () => {
    storage.agregarSesion({
      fecha: '2026-07-15', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }, { reps: 10, pesoKg: 20 }] }],
    });
    montar();
    expect($('.dato-referencia').textContent).toBe('2×10 · 20 kg · 44,1 lb');
  });

  it('si nunca lo hiciste invita a arrancar cómodo (sin culpa)', () => {
    montar();
    $('#btn-siguiente').click(); // Remo: sin historial y sin peso sugerido
    expect($('.dato-referencia').textContent).toMatch(/arrancá cómodo/i);
  });

  it('en kg guarda lo tipeado tal cual', () => {
    montar();
    tipearPeso('22.5');
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5);
  });

  it('en lb convierte a kg antes de guardar', () => {
    storage.setConfig({ ...storage.getConfig(), unidadEntrada: 'lb' });
    montar();
    tipearPeso('45'); // 45 lb = 20,41 kg
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20.41);
  });

  it('al cambiar de unidad el input se reexpresa sin cambiar el dato', () => {
    montar();
    tipearPeso('20');
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20);
    $('[data-unidad="lb"]').click();
    expect(peso().value).toBe('44.1');
    // El dato guardado sigue siendo el mismo: solo cambió cómo se muestra.
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(20);
  });

  it('muestra el equivalente en la otra unidad al lado', () => {
    montar();
    tipearPeso('20');
    expect($('[data-equiv="0"]').textContent).toBe('44,1 lb');
  });

  it('el botón + sube por el paso de la unidad activa', () => {
    montar();
    tipearPeso('20');
    $('[data-paso="1"]').click();
    expect(leerDraft().ejercicios[0].series[0].pesoKg).toBe(22.5); // +2,5 kg
  });

  it('en libras el botón + sube de a 5 lb, no de a 2,5 kg', () => {
    storage.setConfig({ ...storage.getConfig(), unidadEntrada: 'lb' });
    montar();
    tipearPeso('45');
    $('[data-paso="1"]').click();
    expect(peso().value).toBe('50');
  });

  it('el botón − no baja de cero', () => {
    montar();
    $('#btn-siguiente').click(); // Remo arranca sin peso
    $('[data-paso="-1"]').click();
    expect(leerDraft().ejercicios[1].series[0].pesoKg).toBeUndefined();
  });

  it('la unidad elegida se recuerda entre sesiones', () => {
    montar();
    $('[data-unidad="lb"]').click();
    expect(storage.getConfig().unidadEntrada).toBe('lb');
    montar();
    expect($('[data-unidad="lb"]').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('sesión duplicada', () => {
  function terminarYGuardar(respuestas: boolean[] = []) {
    const r = montar(respuestas);
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    return r;
  }

  it('sin sesión previa guarda sin preguntar', () => {
    const { preguntas } = terminarYGuardar();
    expect(preguntas).toHaveLength(0);
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('si ya hay una de fuerza hoy, avisa antes de sumar otra', () => {
    storage.agregarSesion({ fecha: HOY, tipo: 'fuerza', estado: 'hecha' });
    const { preguntas } = terminarYGuardar([false]);
    expect(preguntas[0]).toContain('Ya registraste una sesión de fuerza hoy');
    expect(storage.getSesiones()).toHaveLength(1); // no sumó la segunda
  });

  it('si confirmás, la agrega igual', () => {
    storage.agregarSesion({ fecha: HOY, tipo: 'fuerza', estado: 'hecha' });
    terminarYGuardar([true]);
    expect(storage.getSesiones()).toHaveLength(2);
  });

  it('una de cardio el mismo día no dispara el aviso', () => {
    storage.agregarSesion({ fecha: HOY, tipo: 'cardio', estado: 'hecha' });
    const { preguntas } = terminarYGuardar();
    expect(preguntas).toHaveLength(0);
    expect(storage.getSesiones()).toHaveLength(2);
  });
});

describe('sesión libre', () => {
  function montarLibre(respuestas: boolean[] = []) {
    sessionStorage.setItem('ge:libre', HOY);
    return montar(respuestas);
  }
  const buscarYElegir = (texto: string, id: string) => {
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = texto;
    buscador.dispatchEvent(new Event('input'));
    $(`[data-elegir="${id}"]`).click();
  };

  it('arranca vacía, pidiendo el primer ejercicio', () => {
    montarLibre();
    expect(texto()).toContain('Sesión libre');
    expect(texto()).toContain('Elegí lo que vayas a hacer');
    expect($('#buscar-ej')).not.toBeNull();
  });

  it('elegir un ejercicio lo pone en el wizard con su dosis inicial', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    expect(texto()).toContain('Press banca');
    expect($$('.serie')).toHaveLength(3); // dosisInicial de fuerza
  });

  it('se pueden sumar varios y navegar entre ellos', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $('#btn-sumar').click();
    expect(texto()).toContain('Van 1 en esta sesión');
    buscarYElegir('remo', 'F4');
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
    $('#btn-anterior').click();
    expect(texto()).toContain('Press banca');
  });

  it('se puede sacar un ejercicio de la sesión', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $('#btn-sumar').click();
    buscarYElegir('remo', 'F4');
    $('#btn-quitar-libre').click();
    expect(texto()).toContain('Press banca');
    expect(texto()).toContain('1/1');
  });

  it('no ofrece saltear: en libre se saca y listo', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    expect($('#btn-saltear')).toBeNull();
    expect($('#btn-quitar-libre')).not.toBeNull();
  });

  it('no ofrece fijar el cambio en la rutina', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $('#btn-cambiar').click();
    $('[data-elegir="F2"]').click();
    expect($('[data-alcance="hoy"]')).not.toBeNull();
    expect($('[data-alcance="siempre"]')).toBeNull();
  });

  it('guarda la sesión SIN diaIndex, así no corre la rotación', () => {
    const { rutas } = montarLibre();
    buscarYElegir('press banca', 'F1');
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const s = storage.getSesiones()[0]!;
    expect(s.diaRutina).toBe('Sesión libre');
    expect(s.diaIndex).toBeUndefined();
    expect(s.items![0]).toMatchObject({ ejercicioId: 'F1' });
    expect(rutas).toEqual(['/']);
  });

  it('al guardar sale del modo libre', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(sessionStorage.getItem('ge:libre')).toBeNull();
  });

  it('una sesión libre no adelanta el día que toca en la rutina', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    // Sin sesiones con diaIndex, el motor sigue proponiendo el primer día.
    sessionStorage.removeItem('ge:libre');
    montar();
    expect(texto()).toContain('Día 1 — Empuje');
  });

  it('retoma el draft libre al volver a entrar', () => {
    montarLibre();
    buscarYElegir('press banca', 'F1');
    $$('.serie .check')[0]!.click();
    montarLibre(); // simula recargar
    expect(texto()).toContain('Press banca');
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(true);
  });
});

describe('sesión libre — volver a Hoy y seguir', () => {
  it('se retoma aunque el flag ya no esté (el draft manda)', () => {
    sessionStorage.setItem('ge:libre', HOY);
    montar();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'press banca';
    buscador.dispatchEvent(new Event('input'));
    $('[data-elegir="F1"]').click();
    $$('.serie .check')[0]!.click();

    // Pasar por Hoy limpia el flag; la sesión a medias no se tiene que perder.
    sessionStorage.removeItem('ge:libre');
    montar();
    expect(texto()).toContain('Press banca');
    expect(texto()).toContain('Sesión libre');
    expect(leerDraft().ejercicios[0].series[0].hecha).toBe(true);
  });
});

describe('peso inicial sugerido por la IA', () => {
  const peso = () => ($$('.serie [data-campo="peso"]')[0] as HTMLInputElement).value;

  it('precarga el peso sugerido la primera vez', () => {
    montar();
    expect(peso()).toBe('25');
  });

  it('lo muestra como sugerido, no como "la última vez"', () => {
    montar();
    expect(texto()).toContain('Para arrancar');
    expect(texto()).toContain('25 kg · 55,1 lb');
    expect(texto()).toMatch(/arrancá con/i);
    expect(texto()).not.toContain('La última vez');
  });

  it('en cuanto hay un registro real, manda lo que levantaste', () => {
    storage.agregarSesion({
      fecha: '2026-07-18', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 30 }, { reps: 10, pesoKg: 30 }] }],
    });
    montar();
    expect(peso()).toBe('30');
    expect(texto()).toContain('La última vez');
    expect(texto()).not.toContain('Peso sugerido');
  });

  it('sin sugerido y sin historial el campo de peso queda vacío', () => {
    montar();
    $('#btn-siguiente').click(); // Remo no tiene pesoInicialKg
    expect(peso()).toBe('');
    expect(texto()).toMatch(/arrancá cómodo/i);
  });

  it('el sugerido entra al draft y se guarda si marcás la serie', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.series[0]!.pesoKg).toBe(25);
  });
});

describe('sugerencia de progresión (mejora 1)', () => {
  it('cerraste el tope del rango la última vez → propone subir el peso', () => {
    storage.agregarSesion({
      fecha: '2026-07-18', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 12, pesoKg: 20 }, { reps: 12, pesoKg: 20 }] }],
    });
    montar();
    expect(texto()).toContain('Hoy probá');
    expect($('#btn-usar-sugerencia')).not.toBeNull();
  });

  it('"Usar sugerencia" precarga todas las series con el peso y reps propuestos', () => {
    storage.agregarSesion({
      fecha: '2026-07-18', tipo: 'fuerza', estado: 'hecha',
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 12, pesoKg: 20 }, { reps: 12, pesoKg: 20 }] }],
    });
    montar();
    $('#btn-usar-sugerencia').click();
    const pesos = $$('.serie [data-campo="peso"]').map((i) => (i as HTMLInputElement).value);
    const reps = $$('.serie [data-campo="valor"]').map((i) => (i as HTMLInputElement).value);
    expect(pesos).toEqual(['22.5', '22.5']); // 20 + paso 2,5
    expect(reps).toEqual(['8', '8']); // vuelve al piso del rango
  });

  it('sin historial no hay botón de sugerencia (nada que progresar)', () => {
    montar();
    expect($('#btn-usar-sugerencia')).toBeNull();
  });
});

describe('nota por ejercicio (mejora 8)', () => {
  it('la nota tipeada se guarda en el item de la sesión', () => {
    montar();
    const nota = $('#nota-ej') as HTMLTextAreaElement;
    nota.value = 'el hombro molestó';
    nota.dispatchEvent(new Event('input'));
    $$('.serie .check')[0]!.click(); // marca una serie para que el item se conserve
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.nota).toBe('el hombro molestó');
  });

  it('sin nota no agrega el campo', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.nota).toBeUndefined();
  });
});

describe('ejercicios por tiempo — la unidad del plan manda', () => {
  const PLANCHA: Ejercicio = { ...ej('T1', 'Plancha', 'plancha-core', 'cuerpo', 'core') };
  const ESTIRAR: Ejercicio = { ...ej('T2', 'Estiramiento de isquios', 'estirar-isquios', 'cuerpo', 'isquios'), tipo: 'elongacion' };
  const CINTA: Ejercicio = { ...ej('T3', 'Cinta', 'otro-sistema-cardiovascular', 'maquina', 'cardio'), tipo: 'cardio' };
  const CAT = [...CATALOGO, PLANCHA, ESTIRAR, CINTA];

  function montarDia(ejercicios: Rutina['dias'][number]['ejercicios']) {
    storage.setRutina({
      generadaEl: HOY,
      seed: 1,
      origen: 'reglas',
      dias: [{ nombre: 'Día de prueba', enfoque: 'x', ejercicios }],
    });
    document.body.innerHTML = '<div id="wizard"></div>';
    montarEntrenar({
      contenedor: document.querySelector('#wizard') as HTMLElement,
      catalogo: CAT,
      perfil: PERFIL,
      hoy: () => HOY,
      navegar: () => {},
      confirmar: () => true,
    });
  }

  const PLAN_PLANCHA = { movimiento: 'plancha-core', ejercicioId: 'T1', series: 2, repsMin: 35, repsMax: 50, unidad: 'seg' as const, descansoSeg: 60 };
  const PLAN_ESTIRAR = { movimiento: 'estirar-isquios', ejercicioId: 'T2', series: 2, repsMin: 30, repsMax: 40, unidad: 'seg' as const, descansoSeg: 30 };
  const PLAN_CINTA = { movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'T3', series: 1, repsMin: 30, repsMax: 35, unidad: 'min' as const, descansoSeg: 0 };

  it('una plancha pide segundos, no repeticiones', () => {
    montarDia([PLAN_PLANCHA]);
    const campo = $('.serie [data-campo="valor"]');
    expect(campo.getAttribute('aria-label')).toBe('Segundos serie 1');
    expect(texto()).toContain('Segundos por serie');
    expect(texto()).toContain('Objetivo: 2× 35-50 seg');
  });

  it('un ejercicio por tiempo no pide peso', () => {
    montarDia([PLAN_PLANCHA]);
    expect($$('.serie [data-campo="peso"]')).toHaveLength(0);
    expect($$('.serie .paso')).toHaveLength(0);
  });

  it('el cardio pide minutos', () => {
    montarDia([PLAN_CINTA]);
    expect($('.serie [data-campo="valor"]').getAttribute('aria-label')).toBe('Minutos serie 1');
    // el cronómetro es para segundos: en minutos no tiene sentido
    expect($$('[data-crono]')).toHaveLength(0);
  });

  it('el valor tipeado se guarda como segundos, no metido en reps', () => {
    montarDia([PLAN_PLANCHA]);
    const campo = $('.serie [data-campo="valor"]') as HTMLInputElement;
    campo.value = '42';
    campo.dispatchEvent(new Event('change'));
    expect(leerDraft().ejercicios[0].series[0]).toMatchObject({ reps: 42, segundos: 42 });
  });

  it('la sesión guardada trae los segundos de cada serie', () => {
    montarDia([PLAN_PLANCHA]);
    const campo = $('.serie [data-campo="valor"]') as HTMLInputElement;
    campo.value = '40';
    campo.dispatchEvent(new Event('change'));
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const serie = storage.getSesiones()[0]!.items![0]!.series[0]!;
    expect(serie.segundos).toBe(40);
    expect(serie.pesoKg).toBeUndefined();
  });

  it('el cronómetro carga el tiempo y da la serie por hecha', () => {
    montarDia([PLAN_PLANCHA]);
    $('[data-crono="0"]').click();
    expect($('[data-crono="0"]').textContent).toContain('Parar');
    $('[data-crono="0"]').click();
    const serie = leerDraft().ejercicios[0].series[0];
    expect(serie.segundos).toBeGreaterThan(0);
    expect(serie.hecha).toBe(true);
  });

  it('no sugiere subir el peso en un ejercicio por tiempo', () => {
    storage.setSesiones([
      { fecha: '2026-07-13', tipo: 'fuerza', items: [{ ejercicioId: 'T1', variante: 'cuerpo', series: [{ reps: 50, segundos: 50 }] }] },
    ]);
    montarDia([PLAN_PLANCHA]);
    // La doble progresión es de carga: en segundos no hay peso que subir.
    expect($$('.sugerencia')).toHaveLength(0);
    expect(texto()).not.toContain('Probá');
  });

  it('una sesión de elongación se registra como elongación, no como fuerza', () => {
    montarDia([PLAN_ESTIRAR]);
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.tipo).toBe('elongacion');
  });

  it('un día de cinta se registra como cardio', () => {
    montarDia([PLAN_CINTA]);
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.tipo).toBe('cardio');
  });

  it('cambiar una elongación por un ejercicio de fuerza vuelve a pedir reps', () => {
    montarDia([PLAN_ESTIRAR]);
    expect($('.serie [data-campo="valor"]').getAttribute('aria-label')).toBe('Segundos serie 1');
    $('#btn-cambiar').click();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'press banca';
    buscador.dispatchEvent(new Event('input'));
    $('[data-elegir="F1"]').click();
    $('[data-alcance="hoy"]').click();
    expect($('.serie [data-campo="valor"]').getAttribute('aria-label')).toBe('Repeticiones serie 1');
    expect($$('.serie [data-campo="peso"]')).toHaveLength(2); // vuelve el peso, una por serie
  });

  it('la referencia de la última vez muestra la unidad', () => {
    storage.setSesiones([
      { fecha: '2026-07-13', tipo: 'fuerza', items: [{ ejercicioId: 'T1', variante: 'cuerpo', series: [{ reps: 45, segundos: 45 }, { reps: 45, segundos: 45 }] }] },
    ]);
    montarDia([PLAN_PLANCHA]);
    expect(texto()).toContain('2×45 seg');
  });
});
