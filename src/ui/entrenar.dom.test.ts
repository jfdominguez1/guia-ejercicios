// @vitest-environment jsdom
// Feature: el wizard de entrenamiento de punta a punta. Es la pantalla donde
// más tiempo se pasa y la que más estado maneja (draft, swaps, salteos), así
// que se ejercita con el DOM real y no solo su lógica.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarEntrenar } from './entrenar';
import { storage } from '../lib/storage';
import { sesionCuenta } from '../lib/carriles';
import { CONFIG_DEFAULT } from '../lib/registro';
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

  // El 09/08 JFD cambió "Tobillo sobre la rodilla" por "flexores de cadera con
  // pelota" tocando el chip de implemento, no "Cambiar ejercicio ⇄". La sesión
  // quedó sin enLugarDe y la IA no tuvo cómo enterarse de que ese ejercicio de
  // la rutina no le sirve.
  it('cambiar de implemento también queda registrado como enLugarDe', () => {
    montar();
    $('[data-grupo="maquina"]').click();
    expect(texto()).toContain('en lugar de');
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    expect(storage.getSesiones()[0]!.items![0]).toMatchObject({ ejercicioId: 'F2', enLugarDe: 'F1' });
  });

  it('volver al ejercicio de la rutina no deja "en lugar de sí mismo"', () => {
    montar();
    $('[data-grupo="maquina"]').click();
    $('[data-grupo="pesas"]').click();
    expect(texto()).not.toContain('en lugar de');
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const item = storage.getSesiones()[0]!.items![0]!;
    expect(item.ejercicioId).toBe('F1');
    expect(item.enLugarDe).toBeUndefined();
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

  // El cardio dejó de ser un ejercicio del wizard: tiene su propia pantalla y
  // su propia sesión (decisión de JFD del 09/08). Los minutos y los bpm se
  // piden ahí, no como "serie".
  it('el cardio no entra al wizard: abre su propia pantalla', () => {
    montarDia([PLAN_CINTA]);
    expect($$('.serie')).toHaveLength(0);
    expect($('#cardio-minutos')).toBeTruthy();
    expect($('#cardio-bpm')).toBeTruthy();
    expect(texto()).toContain('Guardar cardio');
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

  it('un día de cardio se registra con su modalidad, minutos y bpm', () => {
    montarDia([PLAN_CINTA]);
    $('[data-modalidad="cinta"]').click();
    ($('#cardio-minutos') as HTMLInputElement).value = '43';
    ($('#cardio-bpm') as HTMLInputElement).value = '115';
    $('#btn-guardar-cardio').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.tipo).toBe('cardio');
    expect(sesion.cardio).toEqual({ tipo: 'cinta', minutos: 43 });
    expect(sesion.fcPromedio).toBe(115);
  });

  // El pedido textual de JFD: "Fue bici fija. Ponelo como opción."
  it('se puede elegir bici fija o bici de calle', () => {
    montarDia([PLAN_CINTA]);
    expect($('[data-modalidad="bici-fija"]')).toBeTruthy();
    $('[data-modalidad="bici-calle"]').click();
    ($('#cardio-minutos') as HTMLInputElement).value = '50';
    $('#btn-guardar-cardio').click();
    expect(storage.getSesiones()[0]!.cardio!.tipo).toBe('bici-calle');
  });

  it('unos minutos imposibles no se guardan en silencio', () => {
    montarDia([PLAN_CINTA]);
    ($('#cardio-minutos') as HTMLInputElement).value = '0';
    $('#btn-guardar-cardio').click();
    expect($('#cardio-error').textContent).toContain('minutos');
    expect(storage.getSesiones()).toHaveLength(0);
  });

  it('una FC fuera de rango tampoco', () => {
    montarDia([PLAN_CINTA]);
    ($('#cardio-minutos') as HTMLInputElement).value = '30';
    ($('#cardio-bpm') as HTMLInputElement).value = '400';
    $('#btn-guardar-cardio').click();
    expect($('#cardio-error').textContent).toContain('FC');
    expect(storage.getSesiones()).toHaveLength(0);
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

  /**
   * Caso real del 02/08: la elongación se precargó con 5 y 10 SEGUNDOS tomados
   * de la sesión del 22/07, que se había registrado en REPS (antes de que la
   * app distinguiera unidades). El plan pedía 30-40 seg. El número quedaba
   * guardado como si se hubiera medido, y no había forma de notarlo.
   */
  it('un registro viejo en reps no precarga el campo de segundos', () => {
    storage.setSesiones([
      { fecha: '2026-07-13', tipo: 'elongacion', items: [{ ejercicioId: 'T2', variante: 'cuerpo', series: [{ reps: 5 }, { reps: 5 }] }] },
    ]);
    montarDia([PLAN_ESTIRAR]);
    const campos = $$('.serie [data-campo="valor"]') as HTMLInputElement[];
    // 30 = repsMin del plan, no el 5 de la sesión medida en repeticiones.
    expect(campos.map((c) => c.value)).toEqual(['30', '30']);
  });

  it('un registro anterior en la MISMA unidad sí se precarga', () => {
    storage.setSesiones([
      { fecha: '2026-07-13', tipo: 'elongacion', items: [{ ejercicioId: 'T2', variante: 'cuerpo', series: [{ reps: 45, segundos: 45 }, { reps: 45, segundos: 45 }] }] },
    ]);
    montarDia([PLAN_ESTIRAR]);
    const campos = $$('.serie [data-campo="valor"]') as HTMLInputElement[];
    expect(campos.map((c) => c.value)).toEqual(['45', '45']);
  });

  it('la referencia de la última vez muestra la unidad', () => {
    storage.setSesiones([
      { fecha: '2026-07-13', tipo: 'fuerza', items: [{ ejercicioId: 'T1', variante: 'cuerpo', series: [{ reps: 45, segundos: 45 }, { reps: 45, segundos: 45 }] }] },
    ]);
    montarDia([PLAN_PLANCHA]);
    expect(texto()).toContain('2×45 seg');
  });
});

// EL BUG DEL 08 Y 09 DE AGOSTO, de punta a punta.
//
// Los días 2 y 4 de la rutina de JFD son un cardio seguido de elongaciones. El
// wizard los guardaba como UNA sesión y descartaba todo ejercicio sin series
// marcadas, así que:
//   · 08/08 — la caminata en cinta no quedó registrada en NINGÚN lado
//   · 09/08 — la bici quedó como cardio suelto, sin relación con su día
//   · las dos sesiones quedaron con tipo 'elongacion' siendo días de cardio
//   · y como el registro quedó vacío, la app volvía a proponer el mismo día
describe('el día de cardio + elongación son dos sesiones', () => {
  const BICI: Ejercicio = { ...ej('CARDIO-bici-z2', 'Bici — zona 2', 'otro-sistema-cardiovascular', 'maquina', 'cardio'), tipo: 'cardio' };
  const ST1: Ejercicio = { ...ej('ST-A', 'Flexor de cadera', 'elongacion-cuadriceps', 'cuerpo', 'cuadriceps'), tipo: 'elongacion' };
  const ST2: Ejercicio = { ...ej('ST-B', 'Tobillo sobre la rodilla', 'elongacion-gluteos', 'cuerpo', 'gluteos'), tipo: 'elongacion' };
  const CAT = [...CATALOGO, BICI, ST1, ST2];

  const PLAN_BICI = { movimiento: 'otro-sistema-cardiovascular', ejercicioId: 'CARDIO-bici-z2', series: 1, repsMin: 40, repsMax: 50, unidad: 'min' as const, descansoSeg: 0 };
  const PLAN_ST1 = { movimiento: 'elongacion-cuadriceps', ejercicioId: 'ST-A', series: 2, repsMin: 30, repsMax: 40, unidad: 'seg' as const, descansoSeg: 10 };
  const PLAN_ST2 = { movimiento: 'elongacion-gluteos', ejercicioId: 'ST-B', series: 2, repsMin: 30, repsMax: 40, unidad: 'seg' as const, descansoSeg: 10 };

  function montarDia4() {
    storage.setRutina({
      generadaEl: HOY,
      seed: 1,
      origen: 'reglas',
      dias: [{ nombre: 'Día 4 — Bici: zona 2', enfoque: 'cardio', ejercicios: [PLAN_BICI, PLAN_ST1, PLAN_ST2] }],
    });
    document.body.innerHTML = '<div id="wizard"></div>';
    const rutas: string[] = [];
    montarEntrenar({
      contenedor: document.querySelector('#wizard') as HTMLElement,
      catalogo: CAT,
      perfil: PERFIL,
      hoy: () => HOY,
      navegar: (r) => rutas.push(r),
      confirmar: () => true,
    });
    return { rutas };
  }

  it('el día abre por el cardio, no por la elongación', () => {
    montarDia4();
    expect(texto()).toContain('Bici — zona 2');
    expect($('#cardio-minutos')).toBeTruthy();
  });

  it('el cardio queda guardado ANTES de empezar la elongación', () => {
    montarDia4();
    ($('#cardio-minutos') as HTMLInputElement).value = '30';
    $('#btn-guardar-cardio').click();
    // Ya está en la base sin haber tocado un solo estiramiento.
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.tipo).toBe('cardio');
    expect(sesion.cardio!.minutos).toBe(30);
    expect(texto()).toContain('Cardio guardado');
  });

  it('la bici queda enganchada a su día de rutina', () => {
    // El 09/08 quedó suelta: sin diaIndex ni diaRutina, imposible saber que era
    // parte del Día 4.
    montarDia4();
    $('#btn-guardar-cardio').click();
    const sesion = storage.getSesiones()[0]!;
    expect(sesion.diaIndex).toBe(0);
    expect(sesion.diaRutina).toBe('Día 4 — Bici: zona 2');
  });

  it('irse justo después del cardio NO pierde el cardio', () => {
    // Es exactamente lo que pasó el 08/08 y costó una sesión entera.
    const { rutas } = montarDia4();
    $('#btn-guardar-cardio').click();
    $('#btn-terminar').click();
    expect(rutas).toContain('/');
    expect(storage.getSesiones()).toHaveLength(1);
    expect(storage.getSesiones()[0]!.tipo).toBe('cardio');
  });

  it('el día completo deja dos sesiones, cada una de su tipo', () => {
    montarDia4();
    ($('#cardio-minutos') as HTMLInputElement).value = '30';
    $('#btn-guardar-cardio').click();
    $('#btn-seguir-resto').click();
    // El wizard ahora solo tiene las elongaciones.
    expect(texto()).toContain('1/2');
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();

    const sesiones = storage.getSesiones();
    expect(sesiones).toHaveLength(2);
    expect(sesiones.map((s) => s.tipo).sort()).toEqual(['cardio', 'elongacion']);
    // Y la de elongación NO se lleva puesto el cardio.
    const elongacion = sesiones.find((s) => s.tipo === 'elongacion')!;
    expect(elongacion.items!.map((i) => i.ejercicioId)).toEqual(['ST-A', 'ST-B']);
  });

  it('salteás el cardio y el resto del día sigue funcionando', () => {
    montarDia4();
    $('#btn-saltear-cardio').click();
    expect(texto()).toContain('1/2');
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-guardar').click();
    const sesiones = storage.getSesiones();
    expect(sesiones.find((s) => s.tipo === 'elongacion')).toBeDefined();
  });

  // Un salteo es una decisión: queda anotado igual que en el resto del día.
  // Antes solo vivía en sessionStorage para no volver a preguntarlo, así que
  // el cardio que dejabas pasar no dejaba ninguna huella.
  it('el cardio salteado queda registrado, pero NO llena el casillero de la semana', () => {
    montarDia4();
    $('#btn-saltear-cardio').click();
    const cardio = storage.getSesiones().find((s) => s.tipo === 'cardio')!;
    expect(cardio.items![0]).toMatchObject({ ejercicioId: 'CARDIO-bici-z2', salteado: true });
    expect(cardio.items![0]!.series).toEqual([]);
    expect(sesionCuenta(cardio)).toBe(false);
  });

  it('volver a entrar al mismo día no vuelve a pedir el cardio ya registrado', () => {
    montarDia4();
    $('#btn-guardar-cardio').click();
    // Sale de la app y vuelve a entrar.
    montarDia4();
    expect($('#cardio-minutos')).toBeNull();
    expect(texto()).toContain('1/2');
  });

  it('un día sin cardio entra derecho al wizard, como siempre', () => {
    storage.setRutina({
      generadaEl: HOY,
      seed: 1,
      origen: 'reglas',
      dias: [{ nombre: 'Día 1 — Fuerza', enfoque: 'x', ejercicios: [PLAN_ST1, PLAN_ST2] }],
    });
    document.body.innerHTML = '<div id="wizard"></div>';
    montarEntrenar({
      contenedor: document.querySelector('#wizard') as HTMLElement,
      catalogo: CAT, perfil: PERFIL, hoy: () => HOY, navegar: () => {}, confirmar: () => true,
    });
    expect($('#cardio-minutos')).toBeNull();
    expect(texto()).toContain('1/2');
  });
});

// El pedido 1.1(3): "si la sesión se guarda sin el item de cardio, que avise
// en vez de guardar en silencio". Vale para cualquier ejercicio: el filtro de
// guardado descarta todo lo que no tenga series marcadas ni esté salteado, y
// así se perdió la caminata en cinta del 08/08 sin un solo mensaje.
describe('lo que quedó sin registrar se avisa antes de guardar', () => {
  it('el resumen los nombra en vez de descartarlos calladamente', () => {
    montar();
    $$('.serie .check')[0]!.click(); // solo el primer ejercicio
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    expect(texto()).toContain('Sin registrar');
    expect(texto()).toContain('Remo');
  });

  it('no molesta cuando está todo registrado o salteado', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-saltear').click();
    expect(texto()).toContain('¡Terminaste!');
    expect(texto()).not.toContain('Sin registrar');
  });

  it('"cargarlo ahora" te lleva justo a ese ejercicio', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-ir-pendiente').click();
    expect(texto()).toContain('Remo');
    expect(texto()).toContain('2/2');
  });

  it('"no lo hice" lo anota como salteado para que no desaparezca', () => {
    montar();
    $$('.serie .check')[0]!.click();
    $('#btn-siguiente').click();
    $('#btn-siguiente').click();
    $('#btn-no-hechos').click();
    expect(texto()).not.toContain('Sin registrar');
    $('#btn-guardar').click();
    const items = storage.getSesiones()[0]!.items!;
    expect(items.map((i) => i.ejercicioId)).toEqual(['F1', 'F4']);
    expect(items[1]!.salteado).toBe(true);
  });
});

// El día que se ofrece en el home tiene que ser el que abre el wizard. Iban por
// caminos distintos: el home por carriles, /entrenar por `resolverSalteo` (que
// solo avanza con fuerza). Con la rutina v10 de JFD el home ofrecía
// "Elongación A" y el wizard arrancaba "Día 4 — Bici", que además es un día de
// puro cardio: saltearlo te devolvía al home sin haber entrenado nada.
describe('el día que abre el wizard es el que ofrece el home', () => {
  const CINTA: Ejercicio = { ...ej('C1', 'Cinta', 'cardio-cinta', 'maquina'), tipo: 'cardio' };
  const BICI: Ejercicio = { ...ej('C2', 'Bici', 'cardio-bici', 'maquina'), tipo: 'cardio' };
  const GATO: Ejercicio = { ...ej('E1', 'Estiramiento del gato', 'elongacion-espalda', 'cuerpo'), tipo: 'elongacion' };
  const CATALOGO_V10 = [...CATALOGO, CINTA, BICI, GATO];

  /** La forma de la v10: 2 días de fuerza, 2 de cardio, 3 de elongación. */
  function rutinaV10(): Rutina {
    const paso = (id: string) => ({ movimiento: 'x', ejercicioId: id, series: 1, repsMin: 8, repsMax: 12, descansoSeg: 60 });
    return {
      generadaEl: HOY, seed: 1, origen: 'reglas',
      dias: [
        { nombre: 'Día 1 — Fuerza A', enfoque: 'gym', ejercicios: [paso('F1')] },
        { nombre: 'Día 2 — Zona 2 en cinta', enfoque: 'cardio', ejercicios: [paso('C1')] },
        { nombre: 'Día 3 — Fuerza B', enfoque: 'gym', ejercicios: [paso('F4')] },
        { nombre: 'Día 4 — Bici: zona 2', enfoque: 'cardio', ejercicios: [paso('C2')] },
        { nombre: 'Elongación A', enfoque: 'la de siempre', ejercicios: [paso('E1')] },
        { nombre: 'Elongación B', enfoque: 'cadera', ejercicios: [paso('E1')] },
        { nombre: 'Elongación C', enfoque: 'espalda', ejercicios: [paso('E1')] },
      ],
    };
  }

  function montarV10() {
    document.body.innerHTML = '<div id="wizard"></div>';
    const rutas: string[] = [];
    montarEntrenar({
      contenedor: document.querySelector('#wizard') as HTMLElement,
      catalogo: CATALOGO_V10,
      perfil: PERFIL,
      hoy: () => HOY,
      navegar: (ruta) => rutas.push(ruta),
      confirmar: () => true,
    });
    return { rutas };
  }

  beforeEach(() => {
    storage.setRutina(rutinaV10());
    // La meta va explícita: para este test hace falta que el carril de
    // elongación sea el más atrasado, y eso no puede depender del objetivo
    // semanal de JFD (que es un dato suyo y cambia).
    storage.setConfig({ ...CONFIG_DEFAULT, metaSemanal: { fuerza: 1, cardio: 1, elongacion: 2 } });
    // La última de fuerza fue el día 3 (índice 2): la rotación vieja pide el
    // índice 3 (la bici). La elongación es la más atrasada, así que el home
    // ofrece "Elongación A" (índice 4).
    storage.agregarSesion({ fecha: '2026-07-19', tipo: 'fuerza', estado: 'hecha', diaIndex: 2 });
  });

  it('abre la elongación que ofrece el home, no el día de bici de la rotación vieja', () => {
    montarV10();
    expect(texto()).toContain('Estiramiento del gato');
    expect(texto()).not.toContain('Bici');
  });

  it('un día de puro cardio no te devuelve al home sin entrenar', () => {
    const { rutas } = montarV10();
    expect(rutas).not.toContain('/');
  });

  it('el día elegido a mano en el home sigue mandando', () => {
    sessionStorage.setItem('ge:dia', JSON.stringify({ fecha: HOY, diaIndex: 3 }));
    montarV10();
    expect(texto()).toContain('Bici');
  });
});

// JFD, del pedido del 09/08: el número se lee igual sea "sostener 30 seg" o
// "10 repeticiones lentas", y en los ejercicios de a un lado no se sabe si es
// por pierna o en total.
describe('la dosis dicha en palabras', () => {
  const ESTIRAR: Ejercicio = { ...ej('S1', 'Flexor de cadera arrodillado', 'elongacion-cadera', 'cuerpo'), tipo: 'elongacion' };

  function montarElongacion(extras: Record<string, unknown>) {
    storage.setRutina({
      generadaEl: HOY, seed: 1, origen: 'ia',
      dias: [{
        nombre: 'Elongación B', enfoque: 'cadera',
        ejercicios: [{ movimiento: 'elongacion-cadera', ejercicioId: 'S1', series: 2, repsMin: 20, repsMax: 30, descansoSeg: 10, ...extras }],
      }],
    });
    document.body.innerHTML = '<div id="wizard"></div>';
    montarEntrenar({
      contenedor: document.querySelector('#wizard') as HTMLElement,
      catalogo: [...CATALOGO, ESTIRAR], perfil: PERFIL, hoy: () => HOY,
      navegar: () => {}, confirmar: () => true,
    });
  }

  it('dice que se sostiene, y cuántas veces', () => {
    montarElongacion({ unidad: 'seg' });
    expect(texto()).toContain('Sostené 20-30 seg, 2 veces');
  });

  it('con porLado avisa que el número es de UN lado', () => {
    montarElongacion({ unidad: 'seg', porLado: true });
    expect(texto()).toContain('Sostené 20-30 seg de cada lado');
    expect(texto()).toContain('20-30 seg por lado');
    expect(texto()).toContain('(de UN lado)');
  });

  it('sin porLado no se menciona el lado: el número es el total', () => {
    montarElongacion({ unidad: 'seg' });
    // Ojo con buscar solo "lado": el ejercicio se llama "arrodillado".
    expect(texto()).not.toContain('por lado');
    expect(texto()).not.toContain('de cada lado');
    expect(texto()).not.toContain('de UN lado');
  });

  it('las repeticiones de elongación se aclaran lentas', () => {
    montarElongacion({ unidad: 'reps', repsMin: 5, repsMax: 8 });
    expect(texto()).toContain('5-8 repeticiones lentas');
  });
});
