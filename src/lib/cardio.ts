// Cardio como sesión propia, separado del resto del día.
//
// Decisión de JFD (09/08): "separémoslo siempre, y que sean sesiones distintas
// la de cardio con sus datos; la elongación post-cardio es algo adicional".
//
// El problema que resuelve: los días 2 y 4 de la rutina son un cardio seguido
// de cuatro elongaciones, y el wizard los guardaba como UNA sesión. Un
// ejercicio sin series marcadas se descartaba al guardar, así que el 08/08 una
// caminata de cinta entera no quedó registrada en ningún lado y el 09/08 la
// bici quedó suelta, sin relación con su día. Además el tipo de la sesión salía
// de lo registrado: dos días de cardio quedaron guardados como 'elongacion'.

import type { DiaRutina, Ejercicio, EjercicioRutina, Sesion, TipoCardio } from './tipos';

/** Modalidades que se pueden elegir al registrar un cardio, en orden de uso. */
export const MODALIDADES: Array<{ valor: TipoCardio; etiqueta: string }> = [
  { valor: 'bici-fija', etiqueta: 'Bici fija' },
  { valor: 'bici-calle', etiqueta: 'Bici de calle' },
  { valor: 'cinta', etiqueta: 'Cinta' },
  { valor: 'caminata', etiqueta: 'Caminata' },
  { valor: 'corrida', etiqueta: 'Corrida' },
  { valor: 'eliptica', etiqueta: 'Elíptica' },
  { valor: 'remo', etiqueta: 'Remo' },
  { valor: 'escalera', etiqueta: 'Escalera' },
  { valor: 'natacion', etiqueta: 'Natación' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const ETIQUETAS = new Map(MODALIDADES.map((m) => [m.valor, m.etiqueta]));

/** Cómo se muestra una modalidad, incluidas las de sesiones viejas. */
export function etiquetaModalidad(tipo: TipoCardio): string {
  // 'bicicleta' es de antes de separar fija y calle: se sigue leyendo.
  if (tipo === 'bicicleta') return 'Bici';
  return ETIQUETAS.get(tipo) ?? tipo;
}

/**
 * Modalidad que corresponde al ejercicio de cardio del catálogo. Es solo el
 * valor con el que arranca la pantalla: la modalidad final la elige el usuario,
 * porque el mismo "Bici — zona 2" puede hacerse fijo o en la calle (que fue
 * exactamente lo que JFD pidió poder distinguir).
 */
export function modalidadDe(ejercicioId: string): TipoCardio {
  const id = ejercicioId.toLowerCase();
  if (id.includes('bici')) return 'bici-fija';
  if (id.includes('cinta')) return 'cinta';
  if (id.includes('correr')) return 'corrida';
  if (id.includes('caminata')) return 'caminata';
  if (id.includes('eliptica')) return 'eliptica';
  if (id.includes('remo')) return 'remo';
  if (id.includes('escalera')) return 'escalera';
  if (id.includes('natacion')) return 'natacion';
  return 'otro';
}

export interface TramosDia {
  /** Ejercicios de cardio: cada uno se registra como su propia sesión. */
  cardio: EjercicioRutina[];
  /** Todo lo demás (fuerza, elongación): va al wizard de siempre. */
  resto: EjercicioRutina[];
}

/**
 * Parte un día en su cardio y su resto, conservando el orden. Un día sin cardio
 * queda con `cardio: []` y se comporta exactamente como antes.
 */
export function partirDia(dia: DiaRutina, catalogo: Ejercicio[]): TramosDia {
  const tipoDe = (id: string) => catalogo.find((c) => c.id === id)?.tipo;
  const cardio: EjercicioRutina[] = [];
  const resto: EjercicioRutina[] = [];
  for (const e of dia.ejercicios) {
    (tipoDe(e.ejercicioId) === 'cardio' ? cardio : resto).push(e);
  }
  return { cardio, resto };
}

/**
 * Un cardio del día que dejaste pasar. Se guarda igual que un salteo del resto
 * del día: `items` con `salteado`, sin series.
 *
 * Por qué se guarda en vez de descartarlo: un salteado es una decisión, y es la
 * señal de "esto lo venís esquivando" (`ejerciciosEsquivados`). Antes el salteo
 * del cardio solo vivía en `sessionStorage` para no volver a preguntarlo, así
 * que no dejaba ninguna huella. **No llena el casillero de la semana**:
 * `sesionCuenta` descarta las sesiones con todos los ejercicios salteados.
 */
export function sesionDeCardioSalteado(
  ejercicio: EjercicioRutina,
  contexto: { fecha: string; diaIndex?: number; nombreDia: string; nombre?: string },
): Sesion {
  const { fecha, diaIndex, nombreDia, nombre } = contexto;
  return {
    fecha,
    tipo: 'cardio',
    estado: 'hecha',
    ...(diaIndex === undefined ? {} : { diaIndex }),
    diaRutina: nombreDia,
    items: [
      {
        ejercicioId: ejercicio.ejercicioId,
        variante: 'maquina',
        ...(nombre ? { nombre } : {}),
        series: [],
        salteado: true,
      },
    ],
  };
}

/**
 * ¿Ya se registró hoy ese ejercicio de cardio? Evita volver a pedirlo si
 * saliste de la app y volviste a entrar al mismo día. Cuenta también el
 * salteado: ya pasaste por esa pantalla y dijiste que no.
 */
export function cardioYaRegistrado(
  sesiones: Sesion[],
  fecha: string,
  ejercicioId: string,
): boolean {
  return sesiones.some(
    (s) =>
      s.fecha === fecha &&
      s.tipo === 'cardio' &&
      (s.items ?? []).some((i) => i.ejercicioId === ejercicioId),
  );
}

/** Los ejercicios de cardio del día que todavía no se registraron hoy. */
export function cardioPendiente(
  tramos: TramosDia,
  sesiones: Sesion[],
  fecha: string,
): EjercicioRutina[] {
  return tramos.cardio.filter((e) => !cardioYaRegistrado(sesiones, fecha, e.ejercicioId));
}

export interface DatosCardio {
  modalidad: TipoCardio;
  minutos: number;
  /** FC promedio en ppm. Opcional: sale de la banda o el reloj. */
  fcPromedio?: number;
}

export interface ErroresCardio {
  minutos?: string;
  fcPromedio?: string;
}

const MIN_MINUTOS = 1;
const MAX_MINUTOS = 600;
const MIN_FC = 40;
const MAX_FC = 220;

/** Validación de la pantalla de cardio, con los mismos rangos que el alta rápida. */
export function validarCardio(datos: Partial<DatosCardio>): ErroresCardio {
  const errores: ErroresCardio = {};
  const { minutos, fcPromedio } = datos;
  if (!minutos || !Number.isFinite(minutos) || minutos < MIN_MINUTOS || minutos > MAX_MINUTOS) {
    errores.minutos = `Los minutos van entre ${MIN_MINUTOS} y ${MAX_MINUTOS}.`;
  }
  if (fcPromedio !== undefined && (fcPromedio < MIN_FC || fcPromedio > MAX_FC)) {
    errores.fcPromedio = `La FC promedio va entre ${MIN_FC} y ${MAX_FC} ppm.`;
  }
  return errores;
}

/**
 * La sesión de cardio de un día de rutina. Lleva `diaIndex` y `diaRutina` —
 * que es lo que faltaba: el 09/08 la bici quedó como cardio suelto, sin forma
 * de saber que era el Día 4. Y lleva `items` para que el ejercicio aparezca en
 * el historial y "la última vez" siga precargando.
 */
export function sesionDeCardio(
  ejercicio: EjercicioRutina,
  datos: DatosCardio,
  contexto: { fecha: string; diaIndex?: number; nombreDia: string; nombre?: string },
): Sesion {
  const { fecha, diaIndex, nombreDia, nombre } = contexto;
  return {
    fecha,
    tipo: 'cardio',
    estado: 'hecha',
    ...(diaIndex === undefined ? {} : { diaIndex }),
    diaRutina: nombreDia,
    cardio: { tipo: datos.modalidad, minutos: datos.minutos },
    ...(datos.fcPromedio ? { fcPromedio: datos.fcPromedio } : {}),
    items: [
      {
        ejercicioId: ejercicio.ejercicioId,
        variante: 'maquina',
        ...(nombre ? { nombre } : {}),
        series: [{ reps: datos.minutos, minutos: datos.minutos }],
      },
    ],
  };
}
