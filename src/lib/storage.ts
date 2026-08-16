// Acceso tipado a localStorage con prefijo ge:. Nunca tira: ante error
// devuelve el default (browser en privado, quota llena, JSON corrupto).

import { fusionarSesiones, leerSesionesDeBackup, type ResultadoFusion } from './backup';
import { asegurarIds } from './historial';
import { CONFIG_DEFAULT } from './registro';
import type { Reporte } from './reporte';
import type { Config, Ejercicio, GrupoGuardado, Perfil, Rutina, Sesion } from './tipos';

const PREFIJO = 'ge:';
// Lo que entra al respaldo. Una clave que falte acá NO se respalda ni se
// restaura: se pierde al cambiar de teléfono, en silencio.
const CLAVES = ['perfil', 'rutina', 'sesiones', 'customs', 'config', 'grupos', 'papelera', 'observaciones', 'reportes'] as const;

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

  /**
   * Observaciones permanentes por ejercicio: `{ ejercicioId: texto }`.
   *
   * Distinto de la "Nota de hoy", que vive en el item de UNA sesión y se pierde
   * de vista al día siguiente. Esto es lo que querés que te aparezca SIEMPRE que
   * te toque ese ejercicio: "el dibujo no coincide", "bajar el asiento dos
   * puntos", "esta rodilla no". JFD (12/08), sobre los dibujos cambiados: "si no
   * coincide yo puedo decirte algo en el campo de observaciones".
   */
  getObservaciones: (): Record<string, string> => leer<Record<string, string>>('observaciones', {}),
  setObservacion(ejercicioId: string, texto: string): void {
    const todas = this.getObservaciones();
    const limpio = texto.trim();
    if (limpio) todas[ejercicioId] = limpio;
    else delete todas[ejercicioId];
    guardar('observaciones', todas);
  },

  /**
   * Problemas de la APP reportados desde "Reportar un problema". No son datos
   * de entrenamiento: viajan en el respaldo y en el export para que lleguen
   * al desarrollador con fecha, pantalla y versión — antes viajaban dictados
   * en el primer campo de texto libre a mano, mezclados con el registro.
   */
  getReportes: (): Reporte[] => leer<Reporte[]>('reportes', []),
  agregarReporte(reporte: Omit<Reporte, 'id'>): void {
    guardar('reportes', [...this.getReportes(), { ...reporte, id: nuevoId() }]);
  },

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

  /**
   * Suma al historial las sesiones de un respaldo, sin tocar rutina, perfil,
   * grupos ni customs. Es lo que hay que usar cuando el respaldo es viejo pero
   * en el teléfono ya hay sesiones nuevas. `null` = el archivo no es un respaldo.
   */
  restaurarHistorial(texto: string): ResultadoFusion | null {
    const entrantes = leerSesionesDeBackup(texto);
    if (!entrantes) return null;
    const fusion = fusionarSesiones(this.getSesiones(), entrantes, nuevoId);
    if (fusion.agregadas > 0) this.setSesiones(fusion.sesiones);
    return fusion;
  },

  /** Reemplaza TODO con el contenido del respaldo (teléfono nuevo, dato perdido). */
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
