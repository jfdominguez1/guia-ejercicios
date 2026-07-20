// Tipos del dominio — sin DOM ni localStorage acá.

export type GrupoEquip = 'banda' | 'pesas' | 'maquina' | 'cuerpo' | 'pelota' | 'rodillo';
export type TipoEjercicio = 'fuerza' | 'elongacion' | 'cardio';
export type UnidadEjercicio = 'reps' | 'seg' | 'min';
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
  /** Solo cardio: saltos/burpees/jacks. No se propone a nivel empiezo con 50+. */
  impacto?: boolean;
  /** 'img' = solo imagen estática (posturas de yoga); default GIF con fallback. */
  media?: 'img';
  /** Elemento necesario además del grupo: silla, barra fija, ayuda/correa, etc. */
  elemento?: string;
  custom?: boolean;
}

export interface Perfil {
  edad: number;
  dias: number;
  nivel: Nivel;
  objetivo: Objetivo;
  equipamiento: GrupoEquip[];
  /** FC máxima medida (ppm). Si falta se estima 220 − edad. */
  fcMaxConocida?: number;
  /** FC en reposo (ppm), informativa. */
  fcReposo?: number;
}

export interface EjercicioRutina {
  movimiento: string;
  ejercicioId: string;
  series: number;
  /** repsMin/repsMax se interpretan según `unidad` (reps, segundos o minutos). */
  repsMin: number;
  repsMax: number;
  /**
   * Default 'reps' si falta (retrocompatible con rutinas viejas); en
   * ejercicios de elongación sin unidad se interpreta como 'seg'.
   * Cardio usa 'min'.
   */
  unidad?: UnidadEjercicio;
  /** Zona de frecuencia cardíaca objetivo en ppm — solo tiene sentido en cardio. */
  fcObjetivo?: { min: number; max: number };
  /** En cardio con series > 1 es recuperación activa entre bloques. */
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

/** Bloque reutilizable armado por la IA o a mano — no rota con la semana. */
export interface GrupoGuardado {
  nombre: string;
  descripcion?: string;
  ejercicios: EjercicioRutina[];
}

export interface SerieHecha {
  reps: number;
  pesoKg?: number;
}

export interface ItemSesion {
  ejercicioId: string;
  variante: GrupoEquip;
  series: SerieHecha[];
  /** Lo dejaste pasar hoy. Se guarda sin series para poder detectar patrones. */
  salteado?: true;
  /** Reemplazó a otro ejercicio solo por hoy (id del que estaba planificado). */
  enLugarDe?: string;
}

export type TipoCardio = 'corrida' | 'caminata' | 'bicicleta' | 'eliptica' | 'cinta';
export type TipoSesion = 'fuerza' | 'cardio' | 'elongacion' | 'otro';
/** 'hecha' = sesión planificada completada · 'otra' = "hice otra cosa". */
export type EstadoSesion = 'hecha' | 'otra';

export interface Sesion {
  /**
   * Id estable. Las sesiones viejas no lo tienen: `asegurarIds` se lo asigna
   * al leerlas. Es lo que permite editar/borrar sin depender de la posición.
   */
  id?: string;
  fecha: string;
  tipo: TipoSesion;
  /** Default 'hecha' si falta (sesiones viejas). */
  estado?: EstadoSesion;
  diaIndex?: number;
  /** Nombre del día planificado al momento de registrar (robusto ante regeneraciones). */
  diaRutina?: string;
  /** "¿Qué tan dura estuvo?" 1-10 — siempre opcional. */
  rpe?: number;
  notas?: string;
  /** Duración aproximada del registro rápido "hice otra cosa". */
  duracionMin?: number;
  /** FC promedio de la sesión en ppm (C2, opcional — típico de banda/reloj). */
  fcPromedio?: number;
  /** Detalle fino (pesos/reps por serie) — opcional, nunca obligatorio. */
  items?: ItemSesion[];
  cardio?: { tipo: TipoCardio; minutos: number; km?: number; sensacion?: string };
}

export interface Config {
  /** Sesiones por semana que cuentan como objetivo en la home. */
  objetivoSemanal: number;
  /** Días sin ninguna sesión a partir de los cuales se entra en modo retomar. */
  umbralPausaDias: number;
  /**
   * Unidad en la que se TIPEA el peso. El dato se guarda siempre en kg; esto
   * solo evita convertir a mano frente a una máquina rotulada en libras.
   */
  unidadEntrada?: UnidadPeso;
}

export type UnidadPeso = 'kg' | 'lb';
