// Acceso tipado a localStorage con prefijo ge:. Nunca tira: ante error
// devuelve el default (browser en privado, quota llena, JSON corrupto).

import { asegurarIds } from './historial';
import { CONFIG_DEFAULT } from './registro';
import type { Config, Ejercicio, GrupoGuardado, Perfil, Rutina, Sesion } from './tipos';

const PREFIJO = 'ge:';
const CLAVES = ['perfil', 'rutina', 'sesiones', 'customs', 'config', 'grupos', 'papelera'] as const;

/** Id estable de sesión. `randomUUID` no existe en contextos no seguros ni en browsers viejos. */
function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // sin espacio o modo privado: la app sigue funcionando en memoria
  }
}

export const storage = {
  getPerfil: (): Perfil | null => leer<Perfil | null>('perfil', null),
  setPerfil: (perfil: Perfil): void => guardar('perfil', perfil),

  getRutina: (): Rutina | null => leer<Rutina | null>('rutina', null),
  setRutina: (rutina: Rutina): void => guardar('rutina', rutina),

  /**
   * Lee las sesiones garantizando que todas tengan id: las registradas antes
   * de que el campo existiera se migran acá y se persisten en el momento.
   */
  getSesiones(): Sesion[] {
    const guardadas = leer<Sesion[]>('sesiones', []);
    const conId = asegurarIds(guardadas, nuevoId);
    if (conId !== guardadas) guardar('sesiones', conId);
    return conId;
  },
  setSesiones: (sesiones: Sesion[]): void => guardar('sesiones', sesiones),
  agregarSesion(sesion: Sesion): void {
    this.setSesiones([...this.getSesiones(), { ...sesion, id: sesion.id ?? nuevoId() }]);
  },

  /** Sesiones borradas recientemente, para poder deshacer. Entra al backup. */
  getPapelera: (): Sesion[] => leer<Sesion[]>('papelera', []),
  setPapelera: (papelera: Sesion[]): void => guardar('papelera', papelera),

  getCustoms: (): Ejercicio[] => leer<Ejercicio[]>('customs', []),
  setCustoms: (customs: Ejercicio[]): void => guardar('customs', customs),

  getGrupos: (): GrupoGuardado[] => leer<GrupoGuardado[]>('grupos', []),
  setGrupos: (grupos: GrupoGuardado[]): void => guardar('grupos', grupos),
  /** Agrega o reemplaza por nombre (reimportar un bloque lo actualiza). */
  guardarGrupo(grupo: GrupoGuardado): void {
    const otros = this.getGrupos().filter((g) => g.nombre !== grupo.nombre);
    this.setGrupos([...otros, grupo]);
  },

  /** Config con defaults: campos nuevos futuros no rompen lo guardado. */
  getConfig: (): Config => ({ ...CONFIG_DEFAULT, ...leer<Partial<Config>>('config', {}) }),
  setConfig: (config: Config): void => guardar('config', config),

  /** Backup completo re-importable (cambio de teléfono / limpieza de browser). */
  exportarBackup(): string {
    const datos = Object.fromEntries(
      CLAVES.map((clave) => [clave, leer<unknown>(clave, null)]),
    );
    return JSON.stringify({ app: 'guia-ejercicios', version: 1, datos });
  },

  restaurarBackup(texto: string): boolean {
    try {
      const backup = JSON.parse(texto) as { datos?: Record<string, unknown> };
      if (!backup.datos || typeof backup.datos !== 'object') return false;
      for (const clave of CLAVES) {
        if (backup.datos[clave] != null) guardar(clave, backup.datos[clave]);
      }
      return true;
    } catch {
      return false;
    }
  },
};
