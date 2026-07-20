import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage } from './storage';
import type { Perfil, Sesion } from './tipos';

function mockLocalStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    _datos: datos,
  };
}

const PERFIL: Perfil = {
  edad: 45,
  dias: 3,
  nivel: 'entrenado',
  objetivo: 'musculo',
  equipamiento: ['pesas', 'maquina'],
};

let ls: ReturnType<typeof mockLocalStorage>;

beforeEach(() => {
  ls = mockLocalStorage();
  vi.stubGlobal('localStorage', ls);
});

describe('storage', () => {
  it('devuelve null/default cuando no hay nada guardado', () => {
    expect(storage.getPerfil()).toBeNull();
    expect(storage.getRutina()).toBeNull();
    expect(storage.getSesiones()).toEqual([]);
    expect(storage.getCustoms()).toEqual([]);
  });

  it('guarda y recupera el perfil con prefijo ge:', () => {
    storage.setPerfil(PERFIL);
    expect(storage.getPerfil()).toEqual(PERFIL);
    expect(ls._datos.has('ge:perfil')).toBe(true);
  });

  it('agregarSesion acumula sin pisar', () => {
    const s1: Sesion = { fecha: '2026-07-10', tipo: 'fuerza', diaIndex: 0, items: [] };
    const s2: Sesion = {
      fecha: '2026-07-12',
      tipo: 'cardio',
      cardio: { tipo: 'caminata', minutos: 30 },
    };
    storage.agregarSesion(s1);
    storage.agregarSesion(s2);
    const guardadas = storage.getSesiones();
    expect(guardadas).toMatchObject([s1, s2]);
    // Cada sesión sale con id propio: es lo que permite editarla/borrarla después.
    expect(guardadas.every((s) => s.id)).toBe(true);
    expect(guardadas[0]!.id).not.toBe(guardadas[1]!.id);
  });

  it('le pone id a las sesiones viejas al leerlas, y lo deja guardado', () => {
    ls.setItem('ge:sesiones', JSON.stringify([{ fecha: '2026-07-10', tipo: 'fuerza' }]));
    const primera = storage.getSesiones();
    expect(primera[0]!.id).toBeTruthy();
    // El id migrado tiene que persistir: si cambiara en cada lectura, editar y
    // borrar apuntarían a una sesión distinta cada vez.
    expect(storage.getSesiones()[0]!.id).toBe(primera[0]!.id);
  });

  it('JSON corrupto devuelve default sin tirar', () => {
    ls.setItem('ge:sesiones', '{esto no es json');
    ls.setItem('ge:perfil', '[1,2,3'); // corrupto
    expect(storage.getSesiones()).toEqual([]);
    expect(storage.getPerfil()).toBeNull();
  });

  it('localStorage roto (quota/privado) no explota al guardar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => storage.setPerfil(PERFIL)).not.toThrow();
  });

  it('config: defaults si no hay nada, merge con lo guardado', () => {
    expect(storage.getConfig()).toEqual({ objetivoSemanal: 3, umbralPausaDias: 7, unidadEntrada: 'kg' });
    ls.setItem('ge:config', '{"objetivoSemanal": 4}');
    expect(storage.getConfig()).toEqual({ objetivoSemanal: 4, umbralPausaDias: 7, unidadEntrada: 'kg' });
  });

  it('backup exporta todo y restaura', () => {
    storage.setPerfil(PERFIL);
    storage.agregarSesion({ fecha: '2026-07-10', tipo: 'fuerza', diaIndex: 0, items: [] });
    const backup = storage.exportarBackup();

    ls.clear();
    expect(storage.getPerfil()).toBeNull();

    expect(storage.restaurarBackup(backup)).toBe(true);
    expect(storage.getPerfil()).toEqual(PERFIL);
    expect(storage.getSesiones()).toHaveLength(1);
    expect(storage.restaurarBackup('no es json')).toBe(false);
  });
});
