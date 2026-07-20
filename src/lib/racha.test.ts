import { describe, expect, it } from 'vitest';
import { calcularRacha, fechaLarga, fraseRacha } from './racha';
import type { Sesion } from './tipos';

const sesion = (fecha: string): Sesion => ({ fecha, tipo: 'fuerza', estado: 'hecha' });

// 2026-07-20 es lunes. Semana en curso: 20 al 26.
const HOY = '2026-07-20';

describe('calcularRacha', () => {
  it('sin sesiones no hay racha ni última', () => {
    expect(calcularRacha([], HOY, 3)).toEqual({ semanas: 0, diasSinEntrenar: null, totalDias: 0 });
  });

  it('cuenta días distintos, no sesiones', () => {
    const dos = [sesion('2026-07-15'), sesion('2026-07-15'), sesion('2026-07-16')];
    expect(calcularRacha(dos, HOY, 3).totalDias).toBe(2);
  });

  it('la semana en curso incompleta no rompe la racha de las anteriores', () => {
    const sesiones = [
      // semana del 6 al 12: 3 días
      sesion('2026-07-06'), sesion('2026-07-08'), sesion('2026-07-10'),
      // semana del 13 al 19: 3 días
      sesion('2026-07-13'), sesion('2026-07-15'), sesion('2026-07-17'),
    ];
    expect(calcularRacha(sesiones, HOY, 3).semanas).toBe(2);
  });

  it('la semana en curso suma recién cuando llega al objetivo', () => {
    const previas = [sesion('2026-07-13'), sesion('2026-07-15'), sesion('2026-07-17')];
    const enCurso = [sesion('2026-07-20'), sesion('2026-07-21')];
    expect(calcularRacha([...previas, ...enCurso], '2026-07-22', 3).semanas).toBe(1);
    expect(calcularRacha([...previas, ...enCurso, sesion('2026-07-22')], '2026-07-22', 3).semanas).toBe(2);
  });

  it('una semana floja corta la racha', () => {
    const sesiones = [
      sesion('2026-07-06'), sesion('2026-07-08'), sesion('2026-07-10'),
      sesion('2026-07-13'), // sola: no llega a 3
      sesion('2026-07-15'),
    ];
    expect(calcularRacha(sesiones, HOY, 3).semanas).toBe(0);
  });

  it('mide los días sin entrenar', () => {
    expect(calcularRacha([sesion('2026-07-20')], HOY, 3).diasSinEntrenar).toBe(0);
    expect(calcularRacha([sesion('2026-07-17')], HOY, 3).diasSinEntrenar).toBe(3);
  });
});

describe('fraseRacha', () => {
  const base = { semanas: 0, diasSinEntrenar: 2, totalDias: 5 };

  it('sin historial invita a arrancar', () => {
    expect(fraseRacha({ semanas: 0, diasSinEntrenar: null, totalDias: 0 }, 0, 3)).toMatch(/primera/i);
  });

  it('reconoce el día ya entrenado antes que cualquier otra cosa', () => {
    expect(fraseRacha({ ...base, diasSinEntrenar: 0 }, 1, 3)).toMatch(/hoy/i);
  });

  it('la racha larga gana sobre el conteo de la semana', () => {
    expect(fraseRacha({ ...base, semanas: 4 }, 1, 3)).toBe('4 semanas seguidas cumpliendo.');
  });

  it('singulariza cuando falta una sola', () => {
    expect(fraseRacha(base, 2, 3)).toBe('1 sesión para cerrar la semana.');
    expect(fraseRacha(base, 1, 3)).toBe('2 sesiones para cerrar la semana.');
  });

  it('después de una pausa larga no culpa', () => {
    const frase = fraseRacha({ semanas: 0, diasSinEntrenar: 12, totalDias: 5 }, 0, 3);
    expect(frase).toMatch(/volver/i);
    expect(frase).not.toMatch(/perdiste|fallaste|abandonaste/i);
  });
});

describe('fechaLarga', () => {
  it('arma la fecha en castellano', () => {
    expect(fechaLarga('2026-07-20')).toBe('Lunes 20 de julio');
    expect(fechaLarga('2026-01-04')).toBe('Domingo 4 de enero');
  });
});
