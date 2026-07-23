// @vitest-environment jsdom
// Feature: la pantalla Rutina (ver y editar los días). Estos tests cubren el
// panel de edición unificado, que antes existía dos veces con features
// distintas — el riesgo de unificar es justo que una pantalla pierda algo.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarRutina } from './rutina';
import { storage } from '../lib/storage';
import type { ResultadoTexto } from './compartir';
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
const PRESS_BANDA = ej('F3', 'Press con banda', 'empuje-pectorales', 'banda');
const REMO = ej('F4', 'Remo', 'traccion-dorsales', 'pesas');
const CATALOGO = [PRESS, PRESS_MAQ, PRESS_BANDA, REMO];

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
        nombre: 'Día 1',
        enfoque: 'empuje',
        ejercicios: [
          { movimiento: 'empuje-pectorales', ejercicioId: 'F1', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
        ],
      },
      { nombre: 'Día 2', enfoque: 'tracción', ejercicios: [] },
    ],
  };
}

function montar(respuestas: boolean[] = [], resultadoCompartir: ResultadoTexto = 'compartido') {
  document.body.innerHTML = '<div id="rutina"></div>';
  const preguntas: string[] = [];
  const compartidos: string[] = [];
  let i = 0;
  montarRutina({
    contenedor: document.querySelector('#rutina') as HTMLElement,
    catalogo: CATALOGO,
    perfil: PERFIL,
    hoy: () => HOY,
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
    compartir: async (texto) => {
      compartidos.push(texto);
      return resultadoCompartir;
    },
  });
  return { preguntas, compartidos };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const texto = () => $('#rutina').textContent!;
const dias = () => storage.getRutina()!.dias;
const abrirEdicion = () => $('[data-editar]').click();

beforeEach(() => {
  localStorage.clear();
  storage.setPerfil(PERFIL);
  storage.setRutina(rutina());
});

describe('listado', () => {
  it('muestra los días con su enfoque y sus ejercicios', () => {
    montar();
    expect(texto()).toContain('Día 1');
    expect(texto()).toContain('empuje');
    expect(texto()).toContain('Press banca');
    expect(texto()).toContain('Día 2');
  });

  it('marca el día que toca hoy', () => {
    montar();
    expect($('.hoy-chip')).not.toBeNull();
  });

  it('un día vacío lo dice en vez de quedar en blanco', () => {
    montar();
    expect(texto()).toContain('Día vacío');
  });

  it('sin rutina ofrece armarla', () => {
    localStorage.removeItem('ge:rutina');
    montar();
    expect(texto()).toContain('Todavía no hay rutina');
  });

  it('comparte la rutina en texto legible, con los días y las dosis', async () => {
    const { compartidos } = montar();
    $('#btn-compartir-rutina').click();
    await Promise.resolve();
    expect(compartidos).toHaveLength(1);
    expect(compartidos[0]).toContain('Día 1 · empuje');
    expect(compartidos[0]).toContain('Press banca — 3× 8-12 reps');
    expect(texto()).toContain('Rutina enviada');
  });

  it('si el usuario cancela el compartir, no dice que se envió', async () => {
    montar([], 'cancelado');
    $('#btn-compartir-rutina').click();
    await Promise.resolve();
    expect(texto()).not.toContain('Rutina enviada');
    expect(($('#btn-compartir-rutina') as HTMLButtonElement).disabled).toBe(false);
  });

  it('avisa de los ejercicios que venís salteando', () => {
    storage.setSesiones([
      { id: 'a', fecha: '2026-07-10', tipo: 'fuerza', items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }] },
      { id: 'b', fecha: '2026-07-12', tipo: 'fuerza', items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }] },
    ]);
    montar();
    expect(texto()).toContain('Venís salteando');
    expect(texto()).toContain('Press banca (2×)');
  });
});

describe('panel de edición', () => {
  it('ofrece los equivalentes que podés hacer con tu equipamiento', () => {
    montar();
    abrirEdicion();
    expect(texto()).toContain('Press en máquina'); // tiene 'maquina'
    expect(texto()).not.toContain('Press con banda'); // no tiene 'banda'
  });

  it('trae la dosis actual precargada, descanso incluido', () => {
    montar();
    abrirEdicion();
    expect(($('[data-campo="series"]') as HTMLInputElement).value).toBe('3');
    expect(($('[data-campo="descansoSeg"]') as HTMLInputElement).value).toBe('90');
  });

  it('guarda la dosis nueva', () => {
    montar();
    abrirEdicion();
    ($('[data-campo="series"]') as HTMLInputElement).value = '5';
    ($('[data-campo="descansoSeg"]') as HTMLInputElement).value = '120';
    $('[data-accion="guardar"]').click();
    expect(dias()[0]!.ejercicios[0]).toMatchObject({ series: 5, descansoSeg: 120 });
  });

  it('elegir un equivalente lo muestra pendiente y recién se aplica al guardar', () => {
    montar();
    abrirEdicion();
    $('[data-elegir="F2"]').click();
    expect(texto()).toContain('Se reemplaza por');
    // Todavía no se tocó la rutina.
    expect(dias()[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
    $('[data-accion="guardar"]').click();
    expect(dias()[0]!.ejercicios[0]!.ejercicioId).toBe('F2');
  });

  it('se puede deshacer el reemplazo antes de guardar', () => {
    montar();
    abrirEdicion();
    $('[data-elegir="F2"]').click();
    $('[data-quitar-reemplazo]').click();
    $('[data-accion="guardar"]').click();
    expect(dias()[0]!.ejercicios[0]!.ejercicioId).toBe('F1');
  });

  it('el buscador sustituye por cualquier ejercicio del catálogo', () => {
    montar();
    abrirEdicion();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'remo';
    buscador.dispatchEvent(new Event('input'));
    $('[data-elegir="F4"]').click();
    $('[data-accion="guardar"]').click();
    expect(dias()[0]!.ejercicios[0]!.ejercicioId).toBe('F4');
    // El movimiento acompaña al ejercicio nuevo.
    expect(dias()[0]!.ejercicios[0]!.movimiento).toBe('traccion-dorsales');
  });

  it('sustituir y cambiar la dosis en el mismo guardado funciona junto', () => {
    montar();
    abrirEdicion();
    $('[data-elegir="F2"]').click();
    ($('[data-campo="series"]') as HTMLInputElement).value = '4';
    $('[data-accion="guardar"]').click();
    expect(dias()[0]!.ejercicios[0]).toMatchObject({ ejercicioId: 'F2', series: 4 });
  });

  it('quitar pregunta antes y saca el ejercicio', () => {
    const { preguntas } = montar([true]);
    abrirEdicion();
    $('[data-accion="quitar"]').click();
    expect(preguntas[0]).toContain('¿Saco este ejercicio del día?');
    expect(dias()[0]!.ejercicios).toHaveLength(0);
  });

  it('cancelar el quitar no saca nada', () => {
    montar([false]);
    abrirEdicion();
    $('[data-accion="quitar"]').click();
    expect(dias()[0]!.ejercicios).toHaveLength(1);
  });

  it('cancelar cierra el panel sin tocar la rutina', () => {
    montar();
    abrirEdicion();
    ($('[data-campo="series"]') as HTMLInputElement).value = '6';
    $('[data-accion="cerrar"]').click();
    expect($('#panel')).toBeNull();
    expect(dias()[0]!.ejercicios[0]!.series).toBe(3);
  });
});

describe('agregar ejercicio', () => {
  it('agrega al día elegido con la dosis inicial de su tipo', () => {
    montar();
    // El segundo "+ Agregar ejercicio" es el del Día 2.
    $$('[data-agregar]')[1]!.click();
    const buscador = $('#buscar-ej') as HTMLInputElement;
    buscador.value = 'remo';
    buscador.dispatchEvent(new Event('input'));
    $('[data-elegir="F4"]').click();
    expect(dias()[1]!.ejercicios).toHaveLength(1);
    expect(dias()[1]!.ejercicios[0]).toMatchObject({ ejercicioId: 'F4', series: 3 });
  });

  it('cancelar no agrega nada', () => {
    montar();
    $$('[data-agregar]')[1]!.click();
    $('#panel .boton-secundario').click();
    expect(dias()[1]!.ejercicios).toHaveLength(0);
  });
});
