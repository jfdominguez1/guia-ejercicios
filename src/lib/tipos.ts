// Tipos del dominio — sin DOM ni localStorage acá.

export type GrupoEquip = 'banda' | 'pesas' | 'maquina' | 'cuerpo' | 'pelota' | 'rodillo';
export type TipoEjercicio = 'fuerza' | 'elongacion';
export type Objetivo = 'fuerza' | 'musculo' | 'tono';
export type Nivel = 'empiezo' | 'entrenado';

export interface Ejercicio {
  id: string;
  nombre_es: string;
  nombre_en: string;
  tipo: TipoEjercicio;
  grupo: GrupoEquip;
  equipment: string;
  zona: string;
  musculo: string;
  secundarios: string[];
  pasos: string[];
  movimiento: string;
  basico: boolean;
  custom?: boolean;
}

export interface Perfil {
  edad: number;
  dias: number;
  nivel: Nivel;
  objetivo: Objetivo;
  equipamiento: GrupoEquip[];
}

export interface EjercicioRutina {
  movimiento: string;
  ejercicioId: string;
  series: number;
  /** En ejercicios de elongación, repsMin/repsMax son segundos de mantenimiento. */
  repsMin: number;
  repsMax: number;
  descansoSeg: number;
}

export interface DiaRutina {
  nombre: string;
  enfoque: string;
  ejercicios: EjercicioRutina[];
}

export interface Rutina {
  generadaEl: string;
  seed: number;
  origen: 'reglas' | 'ia' | 'manual';
  dias: DiaRutina[];
}

export interface SerieHecha {
  reps: number;
  pesoKg?: number;
}

export interface ItemSesion {
  ejercicioId: string;
  variante: GrupoEquip;
  series: SerieHecha[];
}

export type TipoCardio = 'corrida' | 'caminata' | 'bicicleta' | 'eliptica';

export interface Sesion {
  fecha: string;
  tipo: 'fuerza' | 'cardio' | 'elongacion';
  diaIndex?: number;
  items?: ItemSesion[];
  cardio?: { tipo: TipoCardio; minutos: number; km?: number; sensacion?: string };
}
