import { describe, expect, it } from 'vitest';
import { sparkline } from './sparkline';

describe('sparkline', () => {
  it('con menos de dos valores no dibuja', () => {
    expect(sparkline([]).d).toBe('');
    expect(sparkline([5]).d).toBe('');
    expect(sparkline([5]).ultimo).toBeNull();
  });

  it('empieza con M y sigue con L', () => {
    const { d } = sparkline([1, 2, 3]);
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(2);
  });

  it('el primer punto va al margen izquierdo y el último al derecho', () => {
    const s = sparkline([1, 2, 3], 240, 48, 5);
    expect(s.d).toMatch(/^M5 /);
    expect(s.ultimo!.x).toBe(240 - 5);
  });

  it('más valor queda más arriba (y más chico)', () => {
    // creciente: el último (máximo) tiene la y más chica; el primero (mínimo) la más grande
    const s = sparkline([10, 20, 30], 240, 48, 5);
    expect(s.ultimo!.y).toBe(5); // máximo → tope
    // el primer punto (mínimo) toca el piso
    expect(s.d).toContain(`${48 - 5}`);
  });

  it('una serie plana se dibuja en el medio, no en el piso', () => {
    const s = sparkline([20, 20, 20], 240, 48, 5);
    // todas las y iguales al medio
    const ys = s.d.split(/[ML]/).filter(Boolean).map((par) => Number(par.trim().split(' ')[1]));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(24); // alto/2
  });
});
