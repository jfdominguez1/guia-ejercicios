// Ciclo con la IA del usuario: export de texto (perfil + banco + rutina +
// registro + pregunta + formato) e import validado de la respuesta.

import { CONFIG_DEFAULT } from './registro';
import { detectarPausas } from './retomar';
import type {
  DiaRutina,
  Ejercicio,
  GrupoEquip,
  Perfil,
  Rutina,
  Sesion,
  UnidadEjercicio,
} from './tipos';

const SEMANAS_REGISTRO = 8;
const MS_POR_DIA = 86_400_000;
const GRUPOS_VALIDOS: GrupoEquip[] = ['banda', 'pesas', 'maquina', 'cuerpo', 'pelota', 'rodillo'];

export const PREGUNTA_DEFAULT =
  'Con estos datos: ¿mi rutina debe EVOLUCIONAR (progresar cargas/volumen ' +
  'manteniendo estructura) o MEJORAR (cambiar estructura/ejercicios)? ' +
  'Explicá brevemente y devolvé la rutina completa resultante.';

const FORMATO_RESPUESTA = `## Formato de respuesta REQUERIDO

Devolvé UN SOLO bloque \`\`\`json al final con esta estructura exacta:

\`\`\`
{
  "rutina": {
    "generadaEl": "<fecha ISO YYYY-MM-DD>",
    "seed": <número>,
    "origen": "ia",
    "dias": [
      {
        "nombre": "<ej: Día 1 — Empuje>",
        "enfoque": "<músculos del día>",
        "ejercicios": [
          {
            "movimiento": "<campo m del banco>",
            "ejercicioId": "<campo id del banco, o CUSTOM-...>",
            "series": <1-6>,
            "repsMin": <número>,
            "repsMax": <número>,
            "unidad": "<reps|seg|min — opcional, default reps>",
            "fcObjetivo": { "min": <ppm>, "max": <ppm> },
            "descansoSeg": <segundos entre series>
          }
        ]
      }
    ]
  },
  "nuevos_ejercicios": [
    {
      "id": "CUSTOM-<slug-corto>",
      "nombre_es": "<nombre en español>",
      "musculo": "<músculo principal>",
      "grupo": "<banda|pesas|maquina|cuerpo|pelota|rodillo>",
      "tipo": "<fuerza|elongacion>",
      "pasos": ["<paso 1>", "<paso 2>"]
    }
  ]
}
\`\`\`

Reglas: cada "ejercicioId" existe en el banco o en "nuevos_ejercicios"
(prefijo CUSTOM-). "unidad" define qué son repsMin/repsMax: en ejercicios
cardio usá unidad "min" y opcionalmente "fcObjetivo" (zona de frecuencia
cardíaca en ppm); en elongación usá unidad "seg"; en fuerza omitila o usá
"reps". En cardio con series > 1, "descansoSeg" es la recuperación activa
entre bloques. "nuevos_ejercicios" puede ir vacío: []. No agregues texto
después del bloque JSON.`;

function bancoCompacto(catalogo: Ejercicio[], customs: Ejercicio[]): string {
  const items = [...catalogo, ...customs].map((e) =>
    JSON.stringify({ id: e.id, n: e.nombre_es, m: e.movimiento, mu: e.musculo, g: e.grupo, t: e.tipo }),
  );
  return `[\n${items.join(',\n')}\n]`;
}

function sesionesRecientes(sesiones: Sesion[], hoyISO: string): Sesion[] {
  const limite = Date.parse(hoyISO) - SEMANAS_REGISTRO * 7 * MS_POR_DIA;
  return sesiones.filter((s) => Date.parse(s.fecha) >= limite);
}

export function generarExport(
  perfil: Perfil,
  rutina: Rutina,
  sesiones: Sesion[],
  catalogo: Ejercicio[],
  customs: Ejercicio[],
  pregunta?: string,
  hoyISO?: string,
): string {
  const hoy = hoyISO ?? new Date().toISOString().slice(0, 10);
  const recientes = sesionesRecientes(sesiones, hoy);
  const fuerza = recientes.filter((s) => s.tipo === 'fuerza').length;
  const cardio = recientes.filter((s) => s.tipo === 'cardio').length;
  const elongacion = recientes.filter((s) => s.tipo === 'elongacion').length;
  const hechas = recientes.filter((s) => (s.estado ?? 'hecha') === 'hecha').length;
  const otras = recientes.filter((s) => s.estado === 'otra').length;
  const pausas = detectarPausas(recientes, CONFIG_DEFAULT.umbralPausaDias);
  const lineaPausas =
    pausas.length === 0
      ? 'Períodos de pausa detectados: ninguno.'
      : `Períodos de pausa detectados (sin entrenar ${CONFIG_DEFAULT.umbralPausaDias}+ días): ` +
        pausas.map((p) => `${p.desde} → ${p.hasta} (${p.dias} días)`).join(' · ') +
        '. Tenelos en cuenta: ajustá la rutina a lo que realmente pasó, no a lo ideal.';

  return `# Revisión de mi rutina de entrenamiento

## Quién soy

- Edad: ${perfil.edad}
- Días de entrenamiento por semana: ${perfil.dias}
- Nivel: ${perfil.nivel}
- Objetivo: ${perfil.objetivo}
- Equipamiento disponible: ${perfil.equipamiento.join(', ')}

## Banco de ejercicios disponible (elegí de acá por "id")

Formato compacto: id · n (nombre) · m (movimiento) · mu (músculo) · g (equipamiento) · t (fuerza/elongacion).

\`\`\`json
${bancoCompacto(catalogo, customs)}
\`\`\`

## Rutina actual

\`\`\`json
${JSON.stringify(rutina, null, 1)}
\`\`\`

## Registro (últimas ${SEMANAS_REGISTRO} semanas)

Resumen: ${fuerza} sesiones de fuerza, ${cardio} de cardio, ${elongacion} de elongación.
Por estado: ${hechas} sesiones planificadas hechas, ${otras} registradas como "hice otra cosa".
${lineaPausas}
Cada sesión trae "estado" ('hecha' = la planificada, 'otra' = actividad libre con duracionMin).

\`\`\`json
${JSON.stringify(recientes, null, 1)}
\`\`\`

## La pregunta

${pregunta ?? PREGUNTA_DEFAULT}

${FORMATO_RESPUESTA}
`;
}

// ---------------------------------------------------------------------------
// Import

export interface ResultadoImport {
  ok: boolean;
  rutina?: Rutina;
  nuevos?: Ejercicio[];
  errores: string[];
  resumenCambios: string[];
}

function extraerJson(texto: string): unknown {
  const bloque = /```json\s*([\s\S]*?)```/.exec(texto);
  const crudo = bloque?.[1] ?? texto;
  return JSON.parse(crudo);
}

function esNumeroEn(valor: unknown, min: number, max: number): boolean {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
}

const UNIDADES_VALIDAS: UnidadEjercicio[] = ['reps', 'seg', 'min'];
const FC_MIN_PPM = 40;
const FC_MAX_PPM = 220;

function validarUnidad(
  crudo: unknown,
  etiqueta: string,
  id: string,
  errores: string[],
): UnidadEjercicio | undefined {
  if (crudo === undefined || crudo === null) return undefined;
  if (!UNIDADES_VALIDAS.includes(crudo as UnidadEjercicio)) {
    errores.push(`${etiqueta}, "${id}": unidad inválida "${String(crudo)}" (reps, seg o min).`);
    return undefined;
  }
  return crudo as UnidadEjercicio;
}

function validarFc(
  crudo: unknown,
  etiqueta: string,
  id: string,
  errores: string[],
): { min: number; max: number } | undefined {
  if (crudo === undefined || crudo === null) return undefined;
  const fc = crudo as Record<string, unknown>;
  const valido =
    esNumeroEn(fc.min, FC_MIN_PPM, FC_MAX_PPM) &&
    esNumeroEn(fc.max, FC_MIN_PPM, FC_MAX_PPM) &&
    (fc.min as number) < (fc.max as number);
  if (!valido) {
    errores.push(
      `${etiqueta}, "${id}": fcObjetivo inválido (min < max, entre ${FC_MIN_PPM} y ${FC_MAX_PPM} ppm).`,
    );
    return undefined;
  }
  return { min: fc.min as number, max: fc.max as number };
}

function validarNuevos(crudos: unknown, errores: string[]): Ejercicio[] {
  if (crudos === undefined || crudos === null) return [];
  if (!Array.isArray(crudos)) {
    errores.push('"nuevos_ejercicios" tiene que ser una lista.');
    return [];
  }
  const nuevos: Ejercicio[] = [];
  for (const item of crudos as Record<string, unknown>[]) {
    const id = String(item.id ?? '');
    if (!id.startsWith('CUSTOM-')) {
      errores.push(`Ejercicio nuevo con id "${id}": tiene que empezar con CUSTOM-.`);
      continue;
    }
    const grupo = item.grupo as GrupoEquip;
    if (!item.nombre_es || !item.musculo || !GRUPOS_VALIDOS.includes(grupo)) {
      errores.push(`Ejercicio nuevo "${id}": faltan campos (nombre_es, musculo, grupo válido).`);
      continue;
    }
    const tipo = item.tipo === 'elongacion' ? 'elongacion' : 'fuerza';
    nuevos.push({
      id,
      nombre_es: String(item.nombre_es),
      nombre_en: String(item.nombre_en ?? item.nombre_es),
      tipo,
      grupo,
      equipment: grupo,
      zona: String(item.zona ?? ''),
      musculo: String(item.musculo),
      secundarios: Array.isArray(item.secundarios) ? item.secundarios.map(String) : [],
      pasos: Array.isArray(item.pasos) ? item.pasos.map(String) : [],
      movimiento: String(item.movimiento ?? `otro-${String(item.musculo).toLowerCase()}`),
      basico: false,
      custom: true,
    });
  }
  return nuevos;
}

function validarDias(
  crudos: unknown,
  tipoDe: Map<string, string>,
  errores: string[],
): DiaRutina[] {
  if (!Array.isArray(crudos) || crudos.length < 1 || crudos.length > 7) {
    errores.push('La rutina tiene que tener entre 1 y 7 días.');
    return [];
  }
  const dias: DiaRutina[] = [];
  for (const [i, diaCrudo] of (crudos as Record<string, unknown>[]).entries()) {
    const etiqueta = `Día ${i + 1}`;
    const ejerciciosCrudos = diaCrudo.ejercicios;
    if (!Array.isArray(ejerciciosCrudos) || ejerciciosCrudos.length === 0) {
      errores.push(`${etiqueta}: sin ejercicios.`);
      continue;
    }
    const ejercicios = [];
    for (const e of ejerciciosCrudos as Record<string, unknown>[]) {
      const id = String(e.ejercicioId ?? '');
      const tipo = tipoDe.get(id);
      if (!tipo) {
        errores.push(`${etiqueta}: el ejercicio "${id}" no existe en el banco ni en nuevos_ejercicios.`);
        continue;
      }
      const unidad = validarUnidad(e.unidad, etiqueta, id, errores);
      const fcObjetivo = validarFc(e.fcObjetivo, etiqueta, id, errores);
      // sin unidad explícita, elongación se interpreta en segundos (retrocompat)
      const efectiva = unidad ?? (tipo === 'elongacion' ? 'seg' : 'reps');
      const maxValor = efectiva === 'reps' ? 30 : 120;
      if (!esNumeroEn(e.series, 1, 6)) {
        errores.push(`${etiqueta}, "${id}": series fuera de rango (1-6).`);
      }
      if (!esNumeroEn(e.repsMin, 1, maxValor) || !esNumeroEn(e.repsMax, 1, maxValor)) {
        errores.push(`${etiqueta}, "${id}": ${efectiva} fuera de rango (1-${maxValor}).`);
      }
      ejercicios.push({
        movimiento: String(e.movimiento ?? ''),
        ejercicioId: id,
        series: Number(e.series),
        repsMin: Number(e.repsMin),
        repsMax: Number(e.repsMax),
        ...(unidad ? { unidad } : {}),
        ...(fcObjetivo ? { fcObjetivo } : {}),
        descansoSeg: Number(e.descansoSeg ?? 60),
      });
    }
    dias.push({
      nombre: String(diaCrudo.nombre ?? etiqueta),
      enfoque: String(diaCrudo.enfoque ?? ''),
      ejercicios,
    });
  }
  return dias;
}

function diffRutinas(
  actual: Rutina | undefined,
  nueva: DiaRutina[],
  nombreDe: Map<string, string>,
): string[] {
  const cambios: string[] = [];
  if (!actual) {
    cambios.push(`Rutina nueva de ${nueva.length} días.`);
    return cambios;
  }
  if (actual.dias.length !== nueva.length) {
    cambios.push(`Días: ${actual.dias.length} → ${nueva.length}.`);
  }
  const paraCada = Math.max(actual.dias.length, nueva.length);
  for (let i = 0; i < paraCada; i++) {
    const viejo = actual.dias[i];
    const nuevo = nueva[i];
    if (!viejo && nuevo) {
      cambios.push(`+ ${nuevo.nombre} (día nuevo).`);
      continue;
    }
    if (viejo && !nuevo) {
      cambios.push(`− ${viejo.nombre} (día eliminado).`);
      continue;
    }
    if (!viejo || !nuevo) continue;
    const idsViejos = new Set(viejo.ejercicios.map((e) => e.ejercicioId));
    const idsNuevos = new Set(nuevo.ejercicios.map((e) => e.ejercicioId));
    for (const id of idsNuevos) {
      if (!idsViejos.has(id)) cambios.push(`${nuevo.nombre}: + ${nombreDe.get(id) ?? id}.`);
    }
    for (const id of idsViejos) {
      if (!idsNuevos.has(id)) cambios.push(`${nuevo.nombre}: − ${nombreDe.get(id) ?? id}.`);
    }
  }
  if (cambios.length === 0) cambios.push('Sin cambios de estructura (solo series/reps).');
  return cambios;
}

export function validarImport(
  texto: string,
  catalogo: Ejercicio[],
  rutinaActual?: Rutina,
): ResultadoImport {
  const errores: string[] = [];

  let crudo: Record<string, unknown>;
  try {
    const parseado = extraerJson(texto);
    if (typeof parseado !== 'object' || parseado === null) throw new Error('no es un objeto');
    crudo = parseado as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      errores: ['No pude leer el JSON de la respuesta. Pegá la respuesta completa, incluido el bloque ```json.'],
      resumenCambios: [],
    };
  }

  const rutinaCruda = (crudo.rutina ?? crudo) as Record<string, unknown>;
  const nuevos = validarNuevos(crudo.nuevos_ejercicios, errores);

  const tipoDe = new Map<string, string>();
  const nombreDe = new Map<string, string>();
  for (const e of [...catalogo, ...nuevos]) {
    tipoDe.set(e.id, e.tipo);
    nombreDe.set(e.id, e.nombre_es);
  }

  const dias = validarDias(rutinaCruda.dias, tipoDe, errores);

  if (errores.length > 0) {
    return { ok: false, errores, resumenCambios: [] };
  }

  const rutina: Rutina = {
    generadaEl: String(rutinaCruda.generadaEl ?? new Date().toISOString().slice(0, 10)),
    seed: Number(rutinaCruda.seed ?? 0),
    origen: 'ia',
    dias,
  };

  return {
    ok: true,
    rutina,
    nuevos,
    errores: [],
    resumenCambios: diffRutinas(rutinaActual, dias, nombreDe),
  };
}
