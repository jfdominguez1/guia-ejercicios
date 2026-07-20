// Feature: editar y borrar sesiones del historial. Es el dato que no se puede
// recuperar, así que se valida todo y nada se pisa sin pasar validación.
import { describe, it, expect } from 'vitest';
import { asegurarIds, borrarSesion, describirSesion, editarSesion, validarEdicion, type EdicionSesion } from './historial';
import type { Sesion } from './tipos';

const HOY = '2026-07-20';

function sesion(extra: Partial<Sesion> = {}): Sesion {
  return { id: 'a', fecha: '2026-07-18', tipo: 'fuerza', estado: 'hecha', diaRutina: 'Día 1', ...extra };
}

const BASE: EdicionSesion = { fecha: '2026-07-18' };

describe('validarEdicion', () => {
  it('acepta una edición mínima', () => {
    expect(validarEdicion(BASE, HOY)).toEqual([]);
  });

  it('rechaza fechas inválidas o futuras', () => {
    expect(validarEdicion({ fecha: '18/07/2026' }, HOY)).toContain('La fecha no es válida.');
    expect(validarEdicion({ fecha: '2026-07-21' }, HOY)).toContain('No se puede registrar una sesión en el futuro.');
    expect(validarEdicion({ fecha: HOY }, HOY)).toEqual([]);
  });

  it('acota RPE, FC, duración, minutos y km', () => {
    expect(validarEdicion({ ...BASE, rpe: 11 }, HOY)).toContain('El RPE va de 1 a 10.');
    expect(validarEdicion({ ...BASE, rpe: 0 }, HOY)).toContain('El RPE va de 1 a 10.');
    expect(validarEdicion({ ...BASE, fcPromedio: 300 }, HOY)).toContain('La FC promedio va entre 40 y 220 ppm.');
    expect(validarEdicion({ ...BASE, duracionMin: 0 }, HOY)).toContain('La duración va entre 1 y 600 minutos.');
    expect(validarEdicion({ ...BASE, cardio: { minutos: 900 } }, HOY)).toContain('Los minutos de cardio van entre 1 y 600.');
    expect(validarEdicion({ ...BASE, cardio: { minutos: 30, km: -1 } }, HOY)).toContain('Los km van entre 0 y 500.');
  });

  it('valida las series editadas', () => {
    const conSeries: EdicionSesion = {
      ...BASE,
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 5000 }] }],
    };
    expect(validarEdicion(conSeries, HOY)).toContain('El peso va de 0 a 1000 kg.');
  });

  it('no repite el mismo error dos veces', () => {
    const dosMalas: EdicionSesion = {
      ...BASE,
      items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: -1 }, { reps: -2 }] }],
    };
    expect(validarEdicion(dosMalas, HOY)).toEqual(['Las repeticiones van de 0 a 1000.']);
  });

  it('rechaza notas larguísimas', () => {
    expect(validarEdicion({ ...BASE, notas: 'x'.repeat(501) }, HOY)).toHaveLength(1);
  });
});

describe('editarSesion', () => {
  it('cambia la fecha sin tocar el resto', () => {
    const sesiones = [sesion(), sesion({ id: 'b', fecha: '2026-07-19' })];
    const r = editarSesion(sesiones, 'a', { fecha: '2026-07-17' }, HOY);
    expect(r[0]!.fecha).toBe('2026-07-17');
    expect(r[0]!.diaRutina).toBe('Día 1');
    expect(r[1]).toEqual(sesiones[1]);
  });

  it('no muta el array original', () => {
    const sesiones = [sesion()];
    editarSesion(sesiones, 'a', { fecha: '2026-07-17' }, HOY);
    expect(sesiones[0]!.fecha).toBe('2026-07-18');
  });

  it('borra los campos que se dejan vacíos', () => {
    const sesiones = [sesion({ rpe: 8, notas: 'pesado' })];
    const r = editarSesion(sesiones, 'a', { fecha: '2026-07-18' }, HOY);
    expect(r[0]).not.toHaveProperty('rpe');
    expect(r[0]).not.toHaveProperty('notas');
  });

  it('actualiza el cardio conservando el tipo', () => {
    const sesiones = [sesion({ tipo: 'cardio', cardio: { tipo: 'cinta', minutos: 30, km: 4 } })];
    const r = editarSesion(sesiones, 'a', { fecha: '2026-07-18', cardio: { minutos: 45 } }, HOY);
    expect(r[0]!.cardio).toEqual({ tipo: 'cinta', minutos: 45, km: 4 });
  });

  it('rechaza la edición inválida y devuelve todo intacto', () => {
    const sesiones = [sesion()];
    expect(editarSesion(sesiones, 'a', { fecha: '2026-07-30' }, HOY)).toBe(sesiones);
    expect(editarSesion(sesiones, 'a', { fecha: '2026-07-18', rpe: 99 }, HOY)).toBe(sesiones);
  });

  it('id inexistente no hace nada', () => {
    const sesiones = [sesion()];
    expect(editarSesion(sesiones, 'no-existe', BASE, HOY)).toBe(sesiones);
  });

  it('reemplaza las series corregidas', () => {
    const sesiones = [sesion({ items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }] })];
    const r = editarSesion(
      sesiones,
      'a',
      { fecha: '2026-07-18', items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 25 }] }] },
      HOY,
    );
    expect(r[0]!.items![0]!.series[0]!.pesoKg).toBe(25);
  });
});

describe('borrarSesion', () => {
  it('saca solo la sesión indicada', () => {
    const sesiones = [sesion(), sesion({ id: 'b', fecha: '2026-07-19' }), sesion({ id: 'c', fecha: '2026-07-20' })];
    const r = borrarSesion(sesiones, 'b');
    expect(r.map((s) => s.fecha)).toEqual(['2026-07-18', '2026-07-20']);
  });

  it('no muta ni rompe con id inexistente', () => {
    const sesiones = [sesion()];
    expect(borrarSesion(sesiones, 'no-existe')).toBe(sesiones);
    expect(sesiones).toHaveLength(1);
  });
});

describe('describirSesion', () => {
  it('resume lo que se va a borrar', () => {
    expect(describirSesion(sesion())).toBe('2026-07-18 · Día 1');
    expect(describirSesion(sesion({ tipo: 'cardio', diaRutina: undefined, cardio: { tipo: 'cinta', minutos: 30 } })))
      .toBe('2026-07-18 · cardio · cinta 30 min');
    expect(describirSesion(sesion({ items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 8 }, { reps: 8 }] }] })))
      .toBe('2026-07-18 · Día 1 · 2 series');
  });
});

describe('asegurarIds', () => {
  let n = 0;
  const generar = () => `gen-${++n}`;

  it('le pone id solo a las que no tienen', () => {
    n = 0;
    const sesiones = [{ fecha: '2026-07-18', tipo: 'fuerza' } as Sesion, sesion({ id: 'ya-tengo' })];
    const r = asegurarIds(sesiones, generar);
    expect(r[0]!.id).toBe('gen-1');
    expect(r[1]!.id).toBe('ya-tengo');
  });

  it('devuelve el MISMO array si ya estaban todas (no re-guarda al pedo)', () => {
    const sesiones = [sesion()];
    expect(asegurarIds(sesiones, generar)).toBe(sesiones);
  });

  it('no muta el original', () => {
    const sesiones = [{ fecha: '2026-07-18', tipo: 'fuerza' } as Sesion];
    asegurarIds(sesiones, generar);
    expect(sesiones[0]!.id).toBeUndefined();
  });

  it('array vacío no rompe', () => {
    expect(asegurarIds([], generar)).toEqual([]);
  });
});
