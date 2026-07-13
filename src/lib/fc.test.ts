// C1: FC en el perfil + zonas personales. Datos de test FICTICIOS (repo público).
import { describe, it, expect } from 'vitest';
import { fcMaxEfectiva, zonasFc, zonaDe } from './fc';
import type { Perfil } from './tipos';

const BASE: Perfil = {
  edad: 45,
  dias: 3,
  nivel: 'entrenado',
  objetivo: 'musculo',
  equipamiento: ['pesas'],
};

describe('fcMaxEfectiva', () => {
  it('usa la FC máxima conocida si está cargada', () => {
    expect(fcMaxEfectiva({ ...BASE, fcMaxConocida: 180 })).toBe(180);
  });

  it('fallback 220 − edad si no hay dato medido', () => {
    expect(fcMaxEfectiva(BASE)).toBe(175);
    expect(fcMaxEfectiva({ ...BASE, edad: 60 })).toBe(160);
  });
});

describe('zonasFc — 4 zonas en ppm (% de FC máx)', () => {
  it('con máx 180: Recuperación <110, Z2 110-131, Tempo 131-146, Fuerte 146-162', () => {
    const zonas = zonasFc({ ...BASE, fcMaxConocida: 180 });
    expect(zonas).toEqual([
      { nombre: 'Recuperación', min: 0, max: 110 },
      { nombre: 'Zona 2', min: 110, max: 131 },
      { nombre: 'Tempo', min: 131, max: 146 },
      { nombre: 'Fuerte', min: 146, max: 162 },
    ]);
  });

  it('nada por encima del 90% — la última zona es Fuerte', () => {
    const zonas = zonasFc({ ...BASE, fcMaxConocida: 180 });
    expect(zonas[zonas.length - 1]?.nombre).toBe('Fuerte');
    expect(zonas[zonas.length - 1]?.max).toBe(Math.round(180 * 0.9));
  });

  it('cambiar fcMaxConocida cambia las zonas; sin el campo usa 220−edad', () => {
    const medida = zonasFc({ ...BASE, fcMaxConocida: 190 });
    const estimada = zonasFc(BASE); // máx 175
    expect(medida[1]?.max).toBe(Math.round(190 * 0.73));
    expect(estimada[1]?.max).toBe(Math.round(175 * 0.73));
  });
});

describe('zonaDe — a qué zona corresponde una FC', () => {
  it('clasifica una FC en su zona (o null por encima del 90%)', () => {
    const perfil = { ...BASE, fcMaxConocida: 180 };
    expect(zonaDe(100, perfil)?.nombre).toBe('Recuperación');
    expect(zonaDe(120, perfil)?.nombre).toBe('Zona 2');
    expect(zonaDe(140, perfil)?.nombre).toBe('Tempo');
    expect(zonaDe(150, perfil)?.nombre).toBe('Fuerte');
    expect(zonaDe(170, perfil)).toBeNull();
  });
});
