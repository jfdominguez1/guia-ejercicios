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
  /**
   * 'img' = solo imagen estática (posturas de yoga).
   * 'ninguna' = no hay demostración (modalidades de cardio: no existe un GIF de
   * "andar en bici"). Sin esto se pide un archivo que no está y se ve el ícono
   * de imagen rota.
   * Default: GIF con fallback a imagen.
   */
  media?: 'img' | 'ninguna';
  /**
   * Versión del archivo de media. El service worker sirve /media/ cache-first
   * para siempre; cuando un archivo se corrige con la misma URL (los 21 GIFs
   * a los que preprocesar.py les repara el loop), un teléfono que ya lo tenía
   * cacheado no vería nunca el arreglo. La versión entra a la URL como query
   * y fuerza la re-descarga. Ausente = versión original, URL sin query.
   */
  mediaV?: number;
  /**
   * El dibujo puede no ser este ejercicio.
   *
   * Hay archivos que vienen cambiados desde la fuente (el peor: un
   * "estiramiento de pantorrilla" que muestra un remo con mancuerna). Se
   * muestran igual —JFD los prefiere con un aviso antes que sin nada— pero la
   * pantalla avisa y ofrece un equivalente que sí está bien.
   */
  demoDudosa?: boolean;
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
  /**
   * El ejercicio se hace de a un lado por vez (una pierna, un brazo).
   *
   * **Si falta, el número es el TOTAL** — que es lo que la app hizo siempre, así
   * que ninguna rutina vieja cambia de significado. Si viene, `repsMin`/`repsMax`
   * son **por lado**: "30 seg por lado" son 60 en total.
   *
   * Existe porque "flexor de cadera arrodillado, 20-30 seg" se lee igual sean 25
   * en total o 25 por pierna, y ahí el estiramiento es la mitad o el doble.
   */
  porLado?: boolean;
  /** En cardio con series > 1 es recuperación activa entre bloques. */
  descansoSeg: number;
  /**
   * Peso con el que arrancar, en kg. Solo se usa mientras NO haya un registro
   * previo del ejercicio: en cuanto lo hacés una vez, manda lo que levantaste.
   * Lo propone la IA al generar la rutina.
   */
  pesoInicialKg?: number;
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
  /**
   * Repeticiones. En ejercicios por tiempo espeja el valor de `segundos` o
   * `minutos`, para que lo que ya lee este campo (respaldos, progresión) siga
   * funcionando; la unidad real la dicen los dos campos de abajo.
   */
  reps: number;
  pesoKg?: number;
  /** Ejercicios por tiempo (plancha, elongación): duración real de la serie. */
  segundos?: number;
  /** Cardio por minutos: duración real del bloque. */
  minutos?: number;
}

export interface ItemSesion {
  ejercicioId: string;
  variante: GrupoEquip;
  series: SerieHecha[];
  /**
   * Nombre al momento de registrar. El historial no puede depender de que el
   * catálogo nunca cambie: si un id desaparece (ya pasó con un dedup), sin
   * esto la sesión muestra "F0873" en vez del ejercicio.
   */
  nombre?: string;
  /** Lo dejaste pasar hoy. Se guarda sin series para poder detectar patrones. */
  salteado?: true;
  /** Reemplazó a otro ejercicio solo por hoy (id del que estaba planificado). */
  enLugarDe?: string;
  /** Nota puntual de este ejercicio en esta sesión (ej. "el hombro molestó"). */
  nota?: string;
}

/**
 * Modalidad del cardio. 'bici-fija' y 'bici-calle' están separadas a pedido de
 * JFD: en la fija los minutos y la FC se comparan entre sesiones, en la calle
 * dependen del terreno. 'bicicleta' queda solo para leer las sesiones
 * registradas antes de esa separación — no se ofrece más al registrar.
 */
export type TipoCardio =
  | 'corrida'
  | 'caminata'
  | 'bici-fija'
  | 'bici-calle'
  | 'eliptica'
  | 'cinta'
  | 'remo'
  | 'escalera'
  | 'natacion'
  | 'otro'
  | 'bicicleta';
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
  /**
   * Lo hiciste, pero **no es la sesión del día**: los 10 minutos de cinta antes
   * de la fuerza, un estiramiento corto de paso.
   *
   * JFD (12/08): *"una cosa es hacer una sesión de aeróbico y otra cosa es hacer
   * algo de aeróbico… me gusta registrarlo pero no lo considero como un día de
   * aeróbico"*.
   *
   * Se guarda entero (minutos, modalidad, pulsaciones) y va al historial y al
   * export para la IA — **lo único que no hace es llenar el casillero de la
   * semana**, ni correr la rotación de su carril.
   */
  accesorio?: boolean;
}

export interface Config {
  /**
   * Días con actividad por semana. Sigue vivo para la racha y para leer
   * configuraciones viejas; el número de la home ahora es `metaSemanal`.
   */
  objetivoSemanal: number;
  /**
   * Meta por tipo de sesión (2 · 2 · 2 por defecto). Reemplaza al objetivo
   * único, que mostraba verde cinco semanas seguidas mientras la elongación
   * llegaba a 1 de 4 semanas: una métrica agregada no puede mostrar un hueco
   * de un solo tipo. Cuenta SESIONES, no días — las dos de elongación se
   * pueden hacer pegadas a otro día.
   */
  metaSemanal?: { fuerza: number; cardio: number; elongacion: number };
  /** Días sin ninguna sesión a partir de los cuales se entra en modo retomar. */
  umbralPausaDias: number;
  /**
   * Unidad en la que se TIPEA el peso. El dato se guarda siempre en kg; esto
   * solo evita convertir a mano frente a una máquina rotulada en libras.
   */
  unidadEntrada?: UnidadPeso;
}

export type UnidadPeso = 'kg' | 'lb';
