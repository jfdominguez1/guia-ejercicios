import { describe, expect, it } from 'vitest';

import { fusionarSesiones, leerSesionesDeBackup } from './backup';
import type { Sesion } from './tipos';

const idFijo = () => {
  let n = 0;
  return () => `generado-${++n}`;
};

function sesion(parcial: Partial<Sesion> & { fecha: string }): Sesion {
  return { tipo: 'fuerza', ...parcial };
}

describe('leerSesionesDeBackup', () => {
  it('lee las sesiones de un respaldo de la app', () => {
    const texto = JSON.stringify({
      app: 'guia-ejercicios',
      version: 1,
      datos: { sesiones: [sesion({ fecha: '2026-07-13', tipo: 'cardio' })], rutina: null },
    });
    expect(leerSesionesDeBackup(texto)).toHaveLength(1);
  });

  it('devuelve null si no es JSON o no es un respaldo', () => {
    expect(leerSesionesDeBackup('no soy json')).toBeNull();
    expect(leerSesionesDeBackup('{"cualquier":"cosa"}')).toBeNull();
    expect(leerSesionesDeBackup(JSON.stringify({ datos: { sesiones: 'ups' } }))).toBeNull();
  });

  it('un respaldo sin sesiones devuelve lista vacía, no null', () => {
    expect(leerSesionesDeBackup(JSON.stringify({ datos: { sesiones: null } }))).toEqual([]);
    expect(leerSesionesDeBackup(JSON.stringify({ datos: { perfil: {} } }))).toEqual([]);
  });

  it('descarta entradas que no son sesiones en vez de romper', () => {
    const texto = JSON.stringify({
      datos: { sesiones: [sesion({ fecha: '2026-07-13' }), { fecha: 'ayer' }, null, 7] },
    });
    expect(leerSesionesDeBackup(texto)).toHaveLength(1);
  });
});

describe('fusionarSesiones', () => {
  it('suma las que faltan y ordena por fecha', () => {
    const actuales = [sesion({ id: 'c', fecha: '2026-07-21', tipo: 'cardio' })];
    const entrantes = [
      sesion({ id: 'a', fecha: '2026-07-13', tipo: 'cardio' }),
      sesion({ id: 'b', fecha: '2026-07-18' }),
    ];
    const r = fusionarSesiones(actuales, entrantes, idFijo());
    expect(r.agregadas).toBe(2);
    expect(r.omitidas).toBe(0);
    expect(r.sesiones.map((s) => s.fecha)).toEqual(['2026-07-13', '2026-07-18', '2026-07-21']);
  });

  it('no pisa ni duplica una sesión que ya está por id', () => {
    const actuales = [sesion({ id: 'a', fecha: '2026-07-13', rpe: 8 })];
    const entrantes = [sesion({ id: 'a', fecha: '2026-07-13', rpe: 3 })];
    const r = fusionarSesiones(actuales, entrantes, idFijo());
    expect(r.agregadas).toBe(0);
    expect(r.omitidas).toBe(1);
    // el dato del teléfono manda: pudo editarse después del respaldo
    expect(r.sesiones).toBe(actuales);
    expect(r.sesiones[0]!.rpe).toBe(8);
  });

  it('sin id, dedupea por fecha + tipo + día', () => {
    const actuales = [sesion({ fecha: '2026-07-18', diaRutina: 'Día 2' })];
    const entrantes = [
      sesion({ fecha: '2026-07-18', diaRutina: 'Día 2' }),
      sesion({ fecha: '2026-07-18', diaRutina: 'Día 3' }),
    ];
    const r = fusionarSesiones(actuales, entrantes, idFijo());
    expect(r.agregadas).toBe(1);
    expect(r.sesiones.map((s) => s.diaRutina)).toEqual(['Día 2', 'Día 3']);
  });

  it('dos sesiones distintas del mismo día entran las dos', () => {
    const entrantes = [
      sesion({ id: 'x', fecha: '2026-07-20', diaRutina: 'Día 3 — Cinta' }),
      sesion({ id: 'y', fecha: '2026-07-20', diaRutina: 'Día 1 — Fuerza A' }),
    ];
    expect(fusionarSesiones([], entrantes, idFijo()).agregadas).toBe(2);
  });

  it('le pone id a las sesiones viejas que no lo tienen', () => {
    const r = fusionarSesiones([], [sesion({ fecha: '2026-07-13' })], idFijo());
    expect(r.sesiones[0]!.id).toBe('generado-1');
  });

  it('fusionar dos veces el mismo respaldo no duplica nada', () => {
    const backup = [sesion({ id: 'a', fecha: '2026-07-13' }), sesion({ fecha: '2026-07-14' })];
    const primera = fusionarSesiones([], backup, idFijo());
    const segunda = fusionarSesiones(primera.sesiones, backup, idFijo());
    expect(segunda.agregadas).toBe(0);
    expect(segunda.sesiones).toHaveLength(2);
  });

  it('caso real: respaldo del 20/07 sobre las 3 sesiones nuevas del teléfono', () => {
    const enElTelefono = [
      sesion({ id: '1', fecha: '2026-07-21', tipo: 'cardio' }),
      sesion({ id: '2', fecha: '2026-07-22', diaRutina: 'Elongación' }),
      sesion({ id: '3', fecha: '2026-07-23', diaRutina: 'Día 3 — Fuerza B' }),
    ];
    const delRespaldo = [
      sesion({ id: 'a', fecha: '2026-07-13', tipo: 'cardio' }),
      sesion({ id: 'b', fecha: '2026-07-14', tipo: 'cardio' }),
      sesion({ id: 'c', fecha: '2026-07-14', diaRutina: 'Día 1' }),
      sesion({ id: 'd', fecha: '2026-07-15', tipo: 'cardio' }),
      sesion({ id: 'e', fecha: '2026-07-18', tipo: 'cardio' }),
      sesion({ id: 'f', fecha: '2026-07-18', diaRutina: 'Día 2' }),
      sesion({ id: 'g', fecha: '2026-07-20', diaRutina: 'Día 3 — Cinta' }),
      sesion({ id: 'h', fecha: '2026-07-20', diaRutina: 'Día 1' }),
    ];
    const r = fusionarSesiones(enElTelefono, delRespaldo, idFijo());
    expect(r.agregadas).toBe(8);
    expect(r.sesiones).toHaveLength(11);
    // las nuevas siguen ahí y el orden queda cronológico
    expect(r.sesiones[0]!.fecha).toBe('2026-07-13');
    expect(r.sesiones[10]!.fecha).toBe('2026-07-23');
  });
});
