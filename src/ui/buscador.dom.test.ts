// @vitest-environment jsdom
// Feature: buscador de ejercicios compartido (antes copiado en 3 pantallas).
import { describe, it, expect } from 'vitest';
import { crearBuscador } from './buscador';
import type { Ejercicio } from '../lib/tipos';

function ej(id: string, nombre: string, musculo = 'pectorales'): Ejercicio {
  return {
    id, nombre_es: nombre, nombre_en: nombre, tipo: 'fuerza', grupo: 'pesas', equipment: 'x',
    zona: 'z', musculo, secundarios: [], pasos: [], movimiento: 'm', basico: true,
  };
}

const CATALOGO = [ej('F1', 'Press banca'), ej('F2', 'Remo con barra', 'dorsales')];

function montar(htmlInicial?: () => string) {
  const elegidos: string[] = [];
  const caja = crearBuscador({ catalogo: CATALOGO, alElegir: (e) => elegidos.push(e.id), htmlInicial });
  document.body.innerHTML = '';
  document.body.appendChild(caja);
  const input = caja.querySelector('input') as HTMLInputElement;
  const tipear = (texto: string) => {
    input.value = texto;
    input.dispatchEvent(new Event('input'));
  };
  return { caja, input, tipear, elegidos };
}

describe('crearBuscador', () => {
  it('con menos de 2 letras muestra el contenido inicial', () => {
    const { caja, tipear } = montar(() => '<p>sugerencias</p>');
    expect(caja.textContent).toContain('sugerencias');
    tipear('p');
    expect(caja.textContent).toContain('sugerencias');
  });

  it('filtra por nombre y por músculo', () => {
    const { caja, tipear } = montar();
    tipear('press');
    expect(caja.textContent).toContain('Press banca');
    expect(caja.textContent).not.toContain('Remo');
    tipear('dorsales');
    expect(caja.textContent).toContain('Remo con barra');
  });

  it('avisa cuando no hay resultados', () => {
    const { caja, tipear } = montar();
    tipear('zzzz');
    expect(caja.textContent).toContain('Nada con ese nombre');
  });

  it('elegir devuelve el ejercicio', () => {
    const { caja, tipear, elegidos } = montar();
    tipear('press');
    (caja.querySelector('[data-elegir="F1"]') as HTMLElement).click();
    expect(elegidos).toEqual(['F1']);
  });

  it('el input no se repinta al tipear: no pierde foco ni cursor', () => {
    const { input, tipear } = montar();
    const antes = input;
    tipear('press');
    expect(input).toBe(antes);
    expect(input.value).toBe('press');
  });
});

// JFD (12/08): "no están en el banco de datos". Estaban — el buscador cortaba
// en 20 SIN DECIRLO: "glúteos" da 146 coincidencias y se veían 20, así que todo
// lo que no entraba en esa ventana parecía no existir.
describe('cuando hay más resultados que los que entran', () => {
  const muchos: Ejercicio[] = Array.from({ length: 55 }, (_, i) => ej(`E${i}`, `Estiramiento de talones ${i}`));

  function montarCon(lista: Ejercicio[]) {
    document.body.innerHTML = '';
    const elegidos: Ejercicio[] = [];
    document.body.appendChild(crearBuscador({ catalogo: lista, alElegir: (e) => elegidos.push(e) }));
    return elegidos;
  }
  const buscar = (texto: string) => {
    const input = document.querySelector('#buscar-ej') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
  };
  const opciones = () => document.querySelectorAll('[data-elegir]').length;

  it('dice cuántos hay en total, no solo los que muestra', () => {
    montarCon(muchos);
    buscar('talones');
    expect(document.querySelector('[data-conteo]')!.textContent).toContain('55');
    expect(opciones()).toBe(20);
  });

  it('"ver más" trae los que faltaban', () => {
    montarCon(muchos);
    buscar('talones');
    (document.querySelector('[data-ver-mas]') as HTMLElement).click();
    expect(opciones()).toBe(40);
    (document.querySelector('[data-ver-mas]') as HTMLElement).click();
    expect(opciones()).toBe(55);
    expect(document.querySelector('[data-ver-mas]')).toBeNull();
  });

  it('una consulta nueva vuelve a empezar', () => {
    montarCon(muchos);
    buscar('talones');
    (document.querySelector('[data-ver-mas]') as HTMLElement).click();
    buscar('talones 1');
    expect(opciones()).toBeLessThanOrEqual(20);
  });

  it('con pocos resultados no molesta con el conteo', () => {
    montarCon(muchos.slice(0, 3));
    buscar('talones');
    expect(document.querySelector('[data-conteo]')).toBeNull();
    expect(document.querySelector('[data-ver-mas]')).toBeNull();
  });
});
