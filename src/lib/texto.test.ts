import { describe, it, expect } from 'vitest';
import { avisoRestante, TOPE_TEXTO } from './texto';

describe('avisoRestante', () => {
  it('no dice nada mientras sobre lugar', () => {
    expect(avisoRestante(0)).toBeNull();
    expect(avisoRestante(100)).toBeNull();
    // El caso real: el reporte de bug del 09/08 tenía ~90 caracteres y con el
    // tope viejo de 80 ya estaba cortado. Con 500 ni aparece el contador.
    expect(avisoRestante(90)).toBeNull();
  });

  it('avisa cuando se acerca al tope', () => {
    expect(avisoRestante(TOPE_TEXTO - 61)).toBeNull();
    expect(avisoRestante(TOPE_TEXTO - 60)).toBe('Quedan 60 caracteres');
    expect(avisoRestante(TOPE_TEXTO - 2)).toBe('Quedan 2 caracteres');
    expect(avisoRestante(TOPE_TEXTO - 1)).toBe('Queda 1 caracter');
  });

  it('dice que llegó al máximo en vez de cortar en silencio', () => {
    expect(avisoRestante(TOPE_TEXTO)).toBe('Llegaste al máximo de 500 caracteres');
  });

  it('el tope es configurable para campos más cortos', () => {
    expect(avisoRestante(80, 80)).toBe('Llegaste al máximo de 80 caracteres');
    expect(avisoRestante(10, 80)).toBeNull();
  });

  it('el tope alcanza para un texto dictado real', () => {
    // Lo que JFD quiso escribir el 09/08, completo.
    const dictado =
      'Fue bici fija. Ponelo como opcion. Cuandolo puse como ejercicio del dia hoce bici pero no me lo grabo';
    expect(dictado.length).toBeLessThan(TOPE_TEXTO);
    expect(avisoRestante(dictado.length)).toBeNull();
  });
});
