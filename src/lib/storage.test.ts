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
    expect(storage.getSesiones()).toEqual([s1, s2]);
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
