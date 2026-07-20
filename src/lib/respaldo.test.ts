import { describe, expect, it } from 'vitest';
import { estadoRespaldo, textoRespaldo, UMBRAL_RESPALDO_DIAS } from './respaldo';

const HOY = '2026-07-20';

describe('estadoRespaldo', () => {
  it('sin datos no molesta aunque nunca haya respaldado', () => {
    expect(estadoRespaldo(null, HOY, false)).toEqual({ dias: null, avisar: false });
  });

  it('con datos y nunca respaldado, avisa', () => {
    expect(estadoRespaldo(null, HOY, true)).toEqual({ dias: null, avisar: true });
  });

  it('respaldado hoy: no avisa', () => {
    expect(estadoRespaldo(HOY, HOY, true)).toEqual({ dias: 0, avisar: false });
  });

  it('debajo del umbral: no avisa', () => {
    expect(estadoRespaldo('2026-07-17', HOY, true).avisar).toBe(false);
  });

  it('en el umbral justo: avisa', () => {
    const ultimo = '2026-07-13'; // 7 días
    const e = estadoRespaldo(ultimo, HOY, true);
    expect(e.dias).toBe(UMBRAL_RESPALDO_DIAS);
    expect(e.avisar).toBe(true);
  });

  it('una fecha de respaldo en el futuro no da días negativos', () => {
    expect(estadoRespaldo('2026-07-25', HOY, true).dias).toBe(0);
  });
});

describe('textoRespaldo', () => {
  it('nunca respaldó', () => {
    expect(textoRespaldo({ dias: null, avisar: true })).toMatch(/este teléfono/i);
  });

  it('singulariza un día', () => {
    expect(textoRespaldo({ dias: 1, avisar: true })).toMatch(/1 día que/);
  });

  it('plural', () => {
    expect(textoRespaldo({ dias: 9, avisar: true })).toMatch(/9 días que/);
  });

  it('no culpa', () => {
    expect(textoRespaldo({ dias: 30, avisar: true })).not.toMatch(/perdiste|deberías|olvidaste/i);
  });
});
