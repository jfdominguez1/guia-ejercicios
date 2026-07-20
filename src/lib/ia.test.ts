import { describe, it, expect } from 'vitest';
import { generarExport, validarImport } from './ia';
import type { Ejercicio, Perfil, Rutina, Sesion } from './tipos';

function ej(id: string, movimiento: string, extras: Partial<Ejercicio> = {}): Ejercicio {
  return {
    id,
    nombre_es: `ES ${id}`,
    nombre_en: `en ${id}`,
    tipo: 'fuerza',
    grupo: 'pesas',
    equipment: 'dumbbell',
    zona: 'z',
    musculo: 'Pectorales',
    secundarios: [],
    pasos: ['paso'],
    movimiento,
    basico: true,
    ...extras,
  };
}

const CAT: Ejercicio[] = [
  ej('0001', 'empuje-pectorales'),
  ej('0002', 'traccion-dorsales'),
  ej('0003', 'elongacion-isquiotibiales', { tipo: 'elongacion', grupo: 'cuerpo' }),
];

const PERFIL: Perfil = {
  edad: 52,
  dias: 3,
  nivel: 'entrenado',
  objetivo: 'musculo',
  equipamiento: ['pesas', 'banda'],
};

const RUTINA: Rutina = {
  generadaEl: '2026-07-01',
  seed: 3,
  origen: 'reglas',
  dias: [
    {
      nombre: 'Día 1',
      enfoque: 'full',
      ejercicios: [
        { movimiento: 'empuje-pectorales', ejercicioId: '0001', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    },
  ],
};

const SESIONES: Sesion[] = [
  {
    fecha: '2026-07-05',
    tipo: 'fuerza',
    diaIndex: 0,
    items: [{ ejercicioId: '0001', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }],
  },
  { fecha: '2026-03-01', tipo: 'cardio', cardio: { tipo: 'corrida', minutos: 20 } }, // >8 semanas: afuera
];

describe('generarExport', () => {
  const texto = generarExport(PERFIL, RUTINA, SESIONES, CAT, [], undefined, '2026-07-12');

  it('incluye perfil, banco compacto, rutina y registro reciente', () => {
    expect(texto).toContain('52');
    expect(texto).toContain('"0002"'); // banco completo
    expect(texto).toContain('empuje-pectorales');
    expect(texto).toContain('2026-07-05'); // sesión reciente
    expect(texto).not.toContain('2026-03-01'); // más de 8 semanas
  });

  it('incluye la pregunta default evolucionar/mejorar y el formato de respuesta', () => {
    expect(texto).toMatch(/EVOLUCIONAR/);
    expect(texto).toMatch(/MEJORAR/);
    expect(texto).toContain('CUSTOM-');
    expect(texto).toContain('nuevos_ejercicios');
  });

  it('la pregunta es editable', () => {
    const otro = generarExport(PERFIL, RUTINA, SESIONES, CAT, [], '¿Mi pregunta especial?', '2026-07-12');
    expect(otro).toContain('¿Mi pregunta especial?');
    expect(otro).not.toMatch(/EVOLUCIONAR/);
  });

  it('los customs entran al banco', () => {
    const custom = ej('CUSTOM-mi-ejercicio', 'empuje-pectorales', { custom: true });
    const conCustom = generarExport(PERFIL, RUTINA, [], CAT, [custom], undefined, '2026-07-12');
    expect(conCustom).toContain('CUSTOM-mi-ejercicio');
  });
});

describe('validarImport — perfil incluido en la respuesta', () => {
  function conPerfil(perfilJson: string): string {
    return respuestaValida().replace(
      '"nuevos_ejercicios": []',
      `"nuevos_ejercicios": [], "perfil": ${perfilJson}`,
    );
  }

  it('perfil válido → viene en el resultado y no rompe la rutina', () => {
    const r = validarImport(
      conPerfil('{"edad": 48, "dias": 3, "nivel": "empiezo", "objetivo": "tono", "equipamiento": ["pesas", "banda"], "fcMaxConocida": 178, "fcReposo": 60}'),
      CAT,
      RUTINA,
    );
    expect(r.ok).toBe(true);
    expect(r.perfil).toEqual({
      edad: 48, dias: 3, nivel: 'empiezo', objetivo: 'tono',
      equipamiento: ['pesas', 'banda'], fcMaxConocida: 178, fcReposo: 60,
    });
  });

  it('sin perfil en la respuesta → resultado sin perfil (retrocompat)', () => {
    const r = validarImport(respuestaValida(), CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.perfil).toBeUndefined();
  });

  it('perfil inválido (edad fuera de rango, nivel desconocido, equipo malo) → error claro', () => {
    expect(validarImport(conPerfil('{"edad": 8, "dias": 3, "nivel": "empiezo", "objetivo": "tono", "equipamiento": ["pesas"]}'), CAT).ok).toBe(false);
    expect(validarImport(conPerfil('{"edad": 48, "dias": 3, "nivel": "pro", "objetivo": "tono", "equipamiento": ["pesas"]}'), CAT).ok).toBe(false);
    const r = validarImport(conPerfil('{"edad": 48, "dias": 3, "nivel": "empiezo", "objetivo": "tono", "equipamiento": ["gimnasio total"]}'), CAT);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('equipamiento');
  });

  it('fcObjetivo del perfil fuera de ppm humanas → error', () => {
    expect(validarImport(conPerfil('{"edad": 48, "dias": 3, "nivel": "empiezo", "objetivo": "tono", "equipamiento": ["pesas"], "fcMaxConocida": 500}'), CAT).ok).toBe(false);
  });
});

describe('generarExport — FC y zonas en Quién soy (C1)', () => {
  it('con fcMaxConocida y fcReposo: informa dato medido y las 4 zonas', () => {
    const perfil = { ...PERFIL, fcMaxConocida: 180, fcReposo: 58 };
    const texto = generarExport(perfil, RUTINA, [], CAT, [], undefined, '2026-07-12');
    expect(texto).toContain('FC máxima: 180 ppm (medida)');
    expect(texto).toContain('FC en reposo: 58 ppm');
    expect(texto).toContain('Zona 2 110-131');
    expect(texto).toContain('Fuerte 146-162');
  });

  it('sin datos de FC: estima 220−edad y no inventa reposo', () => {
    const texto = generarExport(PERFIL, RUTINA, [], CAT, [], undefined, '2026-07-12');
    expect(texto).toContain('FC máxima: 168 ppm (estimada 220−edad)'); // edad 52
    expect(texto).not.toContain('FC en reposo');
  });
});

describe('generarExport — historial con estados y pausas', () => {
  it('reporta hechas vs "otra" y los períodos de pausa detectados', () => {
    const conPausa: Sesion[] = [
      { fecha: '2026-06-01', tipo: 'fuerza', estado: 'hecha', diaIndex: 0 },
      { fecha: '2026-06-20', tipo: 'cardio', estado: 'otra', duracionMin: 40 },
      { fecha: '2026-07-05', tipo: 'fuerza', diaIndex: 1 }, // vieja sin estado = hecha
    ];
    const texto = generarExport(PERFIL, RUTINA, conPausa, CAT, [], undefined, '2026-07-12');
    expect(texto).toContain('1 registradas como "hice otra cosa"');
    expect(texto).toContain('2026-06-01 → 2026-06-20 (19 días)');
    expect(texto).toContain('2026-06-20 → 2026-07-05 (15 días)');
    expect(texto).toContain('"estado"');
  });

  it('sin pausas lo dice explícito', () => {
    const texto = generarExport(PERFIL, RUTINA, SESIONES, CAT, [], undefined, '2026-07-12');
    expect(texto).toContain('Períodos de pausa detectados: ninguno.');
  });
});

function respuestaValida(extra = ''): string {
  return `La rutina debe evolucionar porque venís progresando.

\`\`\`json
{
  "rutina": {
    "generadaEl": "2026-07-12",
    "seed": 1,
    "origen": "ia",
    "dias": [
      {
        "nombre": "Día 1 — Empuje",
        "enfoque": "pecho",
        "ejercicios": [
          { "movimiento": "empuje-pectorales", "ejercicioId": "0001", "series": 4, "repsMin": 8, "repsMax": 10, "descansoSeg": 90 },
          { "movimiento": "traccion-dorsales", "ejercicioId": "0002", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 90 }
        ]
      }
    ]
  },
  "nuevos_ejercicios": [${extra}]
}
\`\`\``;
}

describe('validarImport', () => {
  it('respuesta válida → ok con rutina y diff contra la actual', () => {
    const r = validarImport(respuestaValida(), CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.rutina?.origen).toBe('ia');
    expect(r.rutina?.dias).toHaveLength(1);
    expect(r.resumenCambios.length).toBeGreaterThan(0);
    expect(r.resumenCambios.join(' ')).toContain('ES 0002'); // agregado
  });

  it('id inexistente → error claro, sin throw', () => {
    const texto = respuestaValida().replace('"0002"', '"9999"');
    const r = validarImport(texto, CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('9999');
  });

  it('JSON roto → error sin throw', () => {
    const r = validarImport('```json\n{rotisimo', CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
  });

  it('elige el bloque con "rutina" aunque antes haya otros bloques json (ej: el banco)', () => {
    const conBanco = `## Banco\n\`\`\`json\n[{"id":"0001","n":"x"}]\n\`\`\`\n\nRespuesta:\n${respuestaValida()}`;
    const r = validarImport(conBanco, CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.rutina?.dias).toHaveLength(1);
  });

  it('pegar el PEDIDO (export sin respuesta) → error que explica que falta la respuesta de la IA', () => {
    const pedido = `# Pedido\n## Banco\n\`\`\`json\n[{"id":"0001","n":"x"}]\n\`\`\`\n## Formato de respuesta REQUERIDO\nDevolvé UN SOLO bloque...`;
    const r = validarImport(pedido, CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('respuesta de tu IA');
  });

  it('series/reps/días fuera de rango → errores', () => {
    const malo = respuestaValida().replace('"series": 4', '"series": 9');
    expect(validarImport(malo, CAT, RUTINA).ok).toBe(false);

    const sinDias = respuestaValida().replace(/"dias": \[[\s\S]*\]\s*\}/, '"dias": [] }');
    expect(validarImport(sinDias, CAT, RUTINA).ok).toBe(false);
  });

  it('ejercicio nuevo CUSTOM válido → aparece en nuevos y su id es usable', () => {
    const nuevo = `{
      "id": "CUSTOM-press-landmine",
      "nombre_es": "Press landmine",
      "musculo": "Pectorales",
      "grupo": "pesas",
      "tipo": "fuerza",
      "pasos": ["Apoyá la barra", "Empujá"]
    }`;
    const texto = respuestaValida(nuevo).replace('"ejercicioId": "0002"', '"ejercicioId": "CUSTOM-press-landmine"');
    const r = validarImport(texto, CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.nuevos).toHaveLength(1);
    expect(r.nuevos?.[0]?.custom).toBe(true);
  });

  it('CUSTOM tipo cardio es válido y conserva el tipo (bug B1)', () => {
    const nuevo = `{
      "id": "CUSTOM-caminata-z2",
      "nombre_es": "Caminata Zona 2",
      "musculo": "Sistema cardiovascular",
      "grupo": "cuerpo",
      "tipo": "cardio",
      "pasos": ["Caminá rápido sosteniendo la zona"]
    }`;
    const texto = respuestaValida(nuevo).replace('"ejercicioId": "0002"', '"ejercicioId": "CUSTOM-caminata-z2"')
      .replace('"repsMin": 8, "repsMax": 12', '"repsMin": 40, "repsMax": 40, "unidad": "min"');
    const r = validarImport(texto, CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.nuevos?.[0]?.tipo).toBe('cardio');
  });

  it('CUSTOM con tipo inválido (ej. yoga) → error claro, no coerción silenciosa', () => {
    const malo = `{
      "id": "CUSTOM-x",
      "nombre_es": "X",
      "musculo": "m",
      "grupo": "cuerpo",
      "tipo": "yoga"
    }`;
    const r = validarImport(respuestaValida(malo), CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('yoga');
  });

  it('CUSTOM sin campos mínimos o sin prefijo → error', () => {
    const malo = `{ "id": "press-landmine", "nombre_es": "X", "musculo": "m", "grupo": "pesas" }`;
    expect(validarImport(respuestaValida(malo), CAT, RUTINA).ok).toBe(false);

    const incompleto = `{ "id": "CUSTOM-x", "nombre_es": "X" }`;
    expect(validarImport(respuestaValida(incompleto), CAT, RUTINA).ok).toBe(false);
  });

  it('elongación acepta segundos (hasta 120) pero fuerza no pasa de 30 reps', () => {
    const conElong = respuestaValida().replace(
      '{ "movimiento": "traccion-dorsales", "ejercicioId": "0002", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 90 }',
      '{ "movimiento": "elongacion-isquiotibiales", "ejercicioId": "0003", "series": 1, "repsMin": 30, "repsMax": 45, "descansoSeg": 10 }',
    );
    expect(validarImport(conElong, CAT, RUTINA).ok).toBe(true);

    const fuerzaLoca = respuestaValida().replace('"repsMax": 12', '"repsMax": 50');
    expect(validarImport(fuerzaLoca, CAT, RUTINA).ok).toBe(false);
  });
});

describe('validarImport — peso inicial sugerido por la IA', () => {
  const conPeso = (valor: string) =>
    respuestaValida().replace(
      '"descansoSeg": 90 },',
      `"descansoSeg": 90, "pesoInicialKg": ${valor} },`,
    );

  it('acepta el peso sugerido y lo guarda en la rutina', () => {
    const r = validarImport(conPeso('22.5'), CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.rutina?.dias[0]?.ejercicios[0]?.pesoInicialKg).toBe(22.5);
  });

  it('sigue siendo opcional: sin el campo importa igual', () => {
    const r = validarImport(respuestaValida(), CAT, RUTINA);
    expect(r.ok).toBe(true);
    expect(r.rutina?.dias[0]?.ejercicios[0]?.pesoInicialKg).toBeUndefined();
  });

  it('un peso disparatado se rechaza con mensaje claro', () => {
    const r = validarImport(conPeso('9000'), CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('pesoInicialKg');
  });

  it('un peso negativo se rechaza', () => {
    expect(validarImport(conPeso('-5'), CAT, RUTINA).ok).toBe(false);
  });

  it('texto en vez de número se rechaza', () => {
    expect(validarImport(conPeso('"pesado"'), CAT, RUTINA).ok).toBe(false);
  });

  it('el prompt le explica el campo a la IA', () => {
    const pedido = generarExport(PERFIL, RUTINA, [], CAT, [], undefined, '2026-07-12');
    expect(pedido).toContain('pesoInicialKg');
  });
});

describe('validarImport — peso inicial solo en fuerza', () => {
  it('rechaza el peso en un ejercicio de elongación', () => {
    const texto = respuestaValida().replace(
      '{ "movimiento": "traccion-dorsales", "ejercicioId": "0002", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 90 }',
      '{ "movimiento": "elongacion-isquiotibiales", "ejercicioId": "0003", "series": 1, "repsMin": 20, "repsMax": 30, "unidad": "seg", "descansoSeg": 10, "pesoInicialKg": 10 }',
    );
    const r = validarImport(texto, CAT, RUTINA);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('solo tiene sentido en ejercicios de fuerza');
  });
});
