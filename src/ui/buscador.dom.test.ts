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
