// Acceso tipado a localStorage con prefijo ge:. Nunca tira: ante error
// devuelve el default (browser en privado, quota llena, JSON corrupto).

import type { Ejercicio, Perfil, Rutina, Sesion } from './tipos';

const PREFIJO = 'ge:';
const CLAVES = ['perfil', 'rutina', 'sesiones', 'customs'] as const;

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

  getSesiones: (): Sesion[] => leer<Sesion[]>('sesiones', []),
  setSesiones: (sesiones: Sesion[]): void => guardar('sesiones', sesiones),
  agregarSesion(sesion: Sesion): void {
    this.setSesiones([...this.getSesiones(), sesion]);
  },

  getCustoms: (): Ejercicio[] => leer<Ejercicio[]>('customs', []),
  setCustoms: (customs: Ejercicio[]): void => guardar('customs', customs),

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
