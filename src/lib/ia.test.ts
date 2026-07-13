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
