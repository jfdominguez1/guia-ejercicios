// C1: FC en el perfil + zonas personales. Datos de test FICTICIOS (repo público).
import { describe, it, expect } from 'vitest';
import { fcMaxEfectiva, fcMaxEstimada, zonasFc, zonaDe } from './fc';
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

  it('sin dato medido estima con Tanaka (208 − 0,7 × edad)', () => {
    expect(fcMaxEfectiva(BASE)).toBe(177); // 208 − 31,5 = 176,5 → 177
    expect(fcMaxEfectiva({ ...BASE, edad: 60 })).toBe(166);
  });

  // La vieja "220 − edad" subestimaba a partir de los 40, que es el caso de
  // este perfil. Si alguien la reinstala, estos números la delatan.
  it('NO usa 220 − edad: a los 60 da 166, no 160', () => {
    expect(fcMaxEstimada(60)).toBe(166);
    expect(fcMaxEstimada(60)).not.toBe(220 - 60);
    expect(fcMaxEstimada(45)).toBe(177);
    expect(fcMaxEstimada(45)).not.toBe(220 - 45);
  });

  // Las 4 zonas son un % de este número: si la estimación cambia, las zonas
  // se corren enteras. Es el motivo por el que la fórmula importa.
  it('la estimación arrastra las zonas: a los 60, Zona 2 sube ~4 ppm', () => {
    const conTanaka = zonasFc({ ...BASE, edad: 60 });
    const conFormulaVieja = zonasFc({ ...BASE, edad: 60, fcMaxConocida: 160 });
    expect(conTanaka[1]?.max).toBe(Math.round(166 * 0.73)); // 121
    expect(conFormulaVieja[1]?.max).toBe(Math.round(160 * 0.73)); // 117
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

  it('cambiar fcMaxConocida cambia las zonas; sin el campo estima con Tanaka', () => {
    const medida = zonasFc({ ...BASE, fcMaxConocida: 190 });
    const estimada = zonasFc(BASE); // máx 177
    expect(medida[1]?.max).toBe(Math.round(190 * 0.73));
    expect(estimada[1]?.max).toBe(Math.round(177 * 0.73));
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
