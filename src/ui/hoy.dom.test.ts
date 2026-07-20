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

function montar(respuestas: boolean[] = []) {
  document.body.innerHTML = '<div id="hoy"></div>';
  const preguntas: string[] = [];
  let i = 0;
  montarHoy({
    contenedor: document.querySelector('#hoy') as HTMLElement,
    catalogo: CATALOGO,
    perfil: PERFIL,
    hoy: () => HOY,
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
  });
  return { preguntas };
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

  it('muestra la métrica de la semana', () => {
    montar();
    expect($('.semana .numero').textContent).toContain('0 de 3');
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
