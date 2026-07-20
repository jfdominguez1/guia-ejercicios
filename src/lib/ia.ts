// Ciclo con la IA del usuario: export de texto (perfil + banco + rutina +
// registro + pregunta + formato) e import validado de la respuesta.

import { fcMaxEfectiva, zonasFc } from './fc';
import { CONFIG_DEFAULT } from './registro';
import { detectarPausas } from './retomar';
import type {
  DiaRutina,
  Ejercicio,
  EjercicioRutina,
  GrupoEquip,
  GrupoGuardado,
  Perfil,
  Rutina,
  Sesion,
  TipoEjercicio,
  UnidadEjercicio,
} from './tipos';

const SEMANAS_REGISTRO = 8;
const MS_POR_DIA = 86_400_000;
const GRUPOS_VALIDOS: GrupoEquip[] = ['banda', 'pesas', 'maquina', 'cuerpo', 'pelota', 'rodillo'];
const TIPOS_VALIDOS: TipoEjercicio[] = ['fuerza', 'elongacion', 'cardio'];

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
            "descansoSeg": <segundos entre series>,
            "pesoInicialKg": <kg con los que arrancar — opcional, solo fuerza>
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
      "tipo": "<fuerza|elongacion|cardio>",
      "pasos": ["<paso 1>", "<paso 2>"]
    }
  ],
  "grupos": [
    {
      "nombre": "<ej: Movilidad de cadera>",
      "descripcion": "<cuándo usarlo>",
      "ejercicios": [ <mismo formato que los de la rutina> ]
    }
  ]
}
\`\`\`

"grupos" es opcional: son bloques sueltos REUTILIZABLES que quedan
guardados aparte de la rutina (calentamientos, movilidad, mini-sesiones
de viaje). Podés mandar solo grupos, sin rutina, si eso es lo pedido.
Reglas: cada "ejercicioId" existe en el banco o en "nuevos_ejercicios"
(prefijo CUSTOM-). "unidad" define qué son repsMin/repsMax: en ejercicios
cardio usá unidad "min" y opcionalmente "fcObjetivo" (zona de frecuencia
cardíaca en ppm); en elongación usá unidad "seg"; en fuerza omitila o usá
"reps". En cardio con series > 1, "descansoSeg" es la recuperación activa
entre bloques. "nuevos_ejercicios" puede ir vacío: []. No agregues texto
después del bloque JSON.

"pesoInicialKg" es el peso sugerido para la PRIMERA vez que haga ese ejercicio
(solo fuerza, en kg; omitilo en ejercicios de peso corporal). La app lo usa para
precargar el campo y no tener que adivinar frente a la máquina, y lo deja de
usar apenas haya un registro real. Sé conservador: mejor quedarse corto y subir
que lesionarse en la primera serie.`;

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
  grupos: GrupoGuardado[] = [],
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
- FC máxima: ${fcMaxEfectiva(perfil)} ppm ${perfil.fcMaxConocida ? '(medida)' : '(estimada 220−edad)'}${
    perfil.fcReposo ? `\n- FC en reposo: ${perfil.fcReposo} ppm` : ''
  }
- Zonas de FC (ppm): ${zonasFc(perfil)
    .map((z) => `${z.nombre} ${z.min}-${z.max}`)
    .join(' · ')} — usalas para el "fcObjetivo" de los días de cardio.

## Banco de ejercicios disponible (elegí de acá por "id")

Formato compacto: id · n (nombre) · m (movimiento) · mu (músculo) · g (equipamiento) · t (fuerza/elongacion).

\`\`\`json
${bancoCompacto(catalogo, customs)}
\`\`\`

## Rutina actual

\`\`\`json
${JSON.stringify(rutina, null, 1)}
\`\`\`
${
  grupos.length
    ? `\n## Mis bloques guardados (reutilizables, aparte de la rutina)\n\n\`\`\`json\n${JSON.stringify(grupos, null, 1)}\n\`\`\`\n`
    : ''
}

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
  /** Bloques reutilizables que la IA armó — quedan guardados aparte de la rutina. */
  grupos?: GrupoGuardado[];
  /** Perfil incluido en la respuesta de la IA (export inicial), ya validado. */
  perfil?: Perfil;
  errores: string[];
  resumenCambios: string[];
}

const NIVELES_VALIDOS = ['empiezo', 'entrenado'];
const OBJETIVOS_VALIDOS = ['fuerza', 'musculo', 'tono'];

function validarPerfil(crudo: unknown, errores: string[]): Perfil | undefined {
  if (crudo === undefined || crudo === null) return undefined;
  const p = crudo as Record<string, unknown>;
  const previos = errores.length;
  if (!esNumeroEn(p.edad, 14, 99)) errores.push('Perfil: edad fuera de rango (14-99).');
  if (!esNumeroEn(p.dias, 1, 6)) errores.push('Perfil: dias tiene que ser 1-6.');
  if (!NIVELES_VALIDOS.includes(p.nivel as string)) errores.push('Perfil: nivel inválido (empiezo|entrenado).');
  if (!OBJETIVOS_VALIDOS.includes(p.objetivo as string)) errores.push('Perfil: objetivo inválido (fuerza|musculo|tono).');
  const equipo = Array.isArray(p.equipamiento) ? (p.equipamiento as string[]) : null;
  if (!equipo || equipo.length === 0 || equipo.some((g) => !GRUPOS_VALIDOS.includes(g as GrupoEquip))) {
    errores.push(`Perfil: equipamiento inválido (lista de: ${GRUPOS_VALIDOS.join(', ')}).`);
  }
  if (p.fcMaxConocida !== undefined && !esNumeroEn(p.fcMaxConocida, 120, 220)) {
    errores.push('Perfil: fcMaxConocida fuera de rango (120-220 ppm).');
  }
  if (p.fcReposo !== undefined && !esNumeroEn(p.fcReposo, 30, 120)) {
    errores.push('Perfil: fcReposo fuera de rango (30-120 ppm).');
  }
  if (errores.length > previos) return undefined;
  return {
    edad: p.edad as number,
    dias: p.dias as number,
    nivel: p.nivel as Perfil['nivel'],
    objetivo: p.objetivo as Perfil['objetivo'],
    equipamiento: p.equipamiento as GrupoEquip[],
    ...(p.fcMaxConocida !== undefined ? { fcMaxConocida: p.fcMaxConocida as number } : {}),
    ...(p.fcReposo !== undefined ? { fcReposo: p.fcReposo as number } : {}),
  };
}

function extraerJson(texto: string): unknown {
  // Puede venir la conversación entera (banco incluido): probamos TODOS los
  // bloques json y nos quedamos con el que trae la rutina.
  const bloques = [...texto.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]!);
  const candidatos = bloques.length > 0 ? bloques : [texto];
  let ultimoValido: unknown;
  let hayValido = false;
  for (const crudo of candidatos) {
    let parseado: unknown;
    try {
      parseado = JSON.parse(crudo);
    } catch {
      continue;
    }
    ultimoValido = parseado;
    hayValido = true;
    if (typeof parseado === 'object' && parseado !== null && !Array.isArray(parseado)) {
      const objeto = parseado as Record<string, unknown>;
      if (objeto.rutina !== undefined || objeto.dias !== undefined) return parseado;
    }
  }
  if (!hayValido) throw new Error('sin JSON válido');
  return ultimoValido;
}

function pareceElPedido(texto: string): boolean {
  return texto.includes('Formato de respuesta REQUERIDO');
}

function esNumeroEn(valor: unknown, min: number, max: number): boolean {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
}

const UNIDADES_VALIDAS: UnidadEjercicio[] = ['reps', 'seg', 'min'];
const PESO_MAX_KG = 500;
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
    const tipoCrudo = item.tipo ?? 'fuerza';
    if (!TIPOS_VALIDOS.includes(tipoCrudo as TipoEjercicio)) {
      errores.push(
        `Ejercicio nuevo "${id}": tipo inválido "${String(tipoCrudo)}" (fuerza, elongacion o cardio).`,
      );
      continue;
    }
    const tipo = tipoCrudo as TipoEjercicio;
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

function validarEjercicios(
  crudos: unknown,
  etiqueta: string,
  tipoDe: Map<string, string>,
  errores: string[],
): EjercicioRutina[] {
  if (!Array.isArray(crudos) || crudos.length === 0) {
    errores.push(`${etiqueta}: sin ejercicios.`);
    return [];
  }
  const ejercicios: EjercicioRutina[] = [];
  for (const e of crudos as Record<string, unknown>[]) {
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
    // El peso inicial es opcional: si viene, tiene que ser un número sano.
    const pesoCrudo = e.pesoInicialKg;
    let pesoInicialKg: number | undefined;
    if (pesoCrudo !== undefined && pesoCrudo !== null) {
      if (!esNumeroEn(pesoCrudo, 0, PESO_MAX_KG)) {
        errores.push(`${etiqueta}, "${id}": pesoInicialKg fuera de rango (0-${PESO_MAX_KG} kg).`);
      } else if (tipo !== 'fuerza') {
        errores.push(`${etiqueta}, "${id}": pesoInicialKg solo tiene sentido en ejercicios de fuerza.`);
      } else {
        pesoInicialKg = Number(pesoCrudo);
      }
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
      ...(pesoInicialKg === undefined ? {} : { pesoInicialKg }),
    });
  }
  return ejercicios;
}

function validarGrupos(
  crudos: unknown,
  tipoDe: Map<string, string>,
  errores: string[],
): GrupoGuardado[] {
  if (crudos === undefined || crudos === null) return [];
  if (!Array.isArray(crudos)) {
    errores.push('"grupos" tiene que ser una lista.');
    return [];
  }
  const grupos: GrupoGuardado[] = [];
  for (const g of crudos as Record<string, unknown>[]) {
    const nombre = String(g.nombre ?? '').trim();
    if (!nombre) {
      errores.push('Hay un grupo sin "nombre" — cada bloque necesita uno.');
      continue;
    }
    const ejercicios = validarEjercicios(g.ejercicios, `Grupo "${nombre}"`, tipoDe, errores);
    grupos.push({
      nombre,
      ...(g.descripcion ? { descripcion: String(g.descripcion) } : {}),
      ejercicios,
    });
  }
  return grupos;
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
    const ejercicios = validarEjercicios(diaCrudo.ejercicios, etiqueta, tipoDe, errores);
    if (ejercicios.length === 0 && !Array.isArray(diaCrudo.ejercicios)) continue;
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
    if (typeof parseado !== 'object' || parseado === null || Array.isArray(parseado)) {
      throw new Error('no es un objeto');
    }
    crudo = parseado as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      errores: [
        pareceElPedido(texto)
          ? 'Esto parece el PEDIDO para tu IA, no su respuesta. Pegale este texto a tu IA y acá importá la respuesta de tu IA (el bloque ```json con "rutina").'
          : 'No pude leer el JSON de la respuesta. Pegá la respuesta completa de tu IA, incluido el bloque ```json.',
      ],
      resumenCambios: [],
    };
  }
  if (crudo.rutina === undefined && crudo.dias === undefined && pareceElPedido(texto)) {
    return {
      ok: false,
      errores: [
        'Esto parece el PEDIDO para tu IA, no su respuesta. Pegale este texto a tu IA y acá importá la respuesta de tu IA (el bloque ```json con "rutina").',
      ],
      resumenCambios: [],
    };
  }

  const rutinaCruda = (crudo.rutina ?? crudo) as Record<string, unknown>;
  const nuevos = validarNuevos(crudo.nuevos_ejercicios, errores);
  const perfil = validarPerfil(crudo.perfil, errores);

  const tipoDe = new Map<string, string>();
  const nombreDe = new Map<string, string>();
  for (const e of [...catalogo, ...nuevos]) {
    tipoDe.set(e.id, e.tipo);
    nombreDe.set(e.id, e.nombre_es);
  }

  const grupos = validarGrupos(crudo.grupos, tipoDe, errores);
  const hayRutina = rutinaCruda.dias !== undefined;
  if (!hayRutina && grupos.length === 0 && errores.length === 0) {
    errores.push('La respuesta no trae ni "rutina" ni "grupos" — no hay nada que importar.');
  }
  const dias = hayRutina ? validarDias(rutinaCruda.dias, tipoDe, errores) : [];

  if (errores.length > 0) {
    return { ok: false, errores, resumenCambios: [] };
  }

  const rutina: Rutina | undefined = hayRutina
    ? {
        generadaEl: String(rutinaCruda.generadaEl ?? new Date().toISOString().slice(0, 10)),
        seed: Number(rutinaCruda.seed ?? 0),
        origen: 'ia',
        dias,
      }
    : undefined;

  const resumenCambios = hayRutina ? diffRutinas(rutinaActual, dias, nombreDe) : [];
  for (const g of grupos) {
    resumenCambios.push(`+ Bloque guardado: ${g.nombre} (${g.ejercicios.length} ejercicios).`);
  }

  return {
    ok: true,
    ...(rutina ? { rutina } : {}),
    nuevos,
    ...(grupos.length ? { grupos } : {}),
    ...(perfil ? { perfil } : {}),
    errores: [],
    resumenCambios,
  };
}
