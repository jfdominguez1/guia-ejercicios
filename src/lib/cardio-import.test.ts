// Import de rutinas con cardio nativo (unidad min + fcObjetivo) y retrocompat.
import { describe, it, expect } from 'vitest';
import { validarImport, generarExport } from './ia';
import { generarRutina } from './motor';
import type { Ejercicio, Perfil } from './tipos';

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
    pasos: [],
    movimiento,
    basico: true,
    ...extras,
  };
}

const CAT: Ejercicio[] = [
  ej('0001', 'empuje-pectorales'),
  ej('0684', 'otro-sistema-cardiovascular', { tipo: 'cardio', grupo: 'cuerpo' }),
  ej('3666', 'otro-sistema-cardiovascular', { tipo: 'cardio', grupo: 'maquina' }),
];

const DIA_INTERVALOS = `\`\`\`json
{
  "rutina": {
    "generadaEl": "2026-07-12",
    "seed": 1,
    "origen": "ia",
    "dias": [
      {
        "nombre": "Día Cinta — Intervalos",
        "enfoque": "6 bloques de trote con recuperación caminando",
        "ejercicios": [
          {"movimiento": "otro-sistema-cardiovascular", "ejercicioId": "3666", "series": 1, "repsMin": 5, "repsMax": 5, "unidad": "min", "fcObjetivo": {"min": 100, "max": 115}, "descansoSeg": 0},
          {"movimiento": "otro-sistema-cardiovascular", "ejercicioId": "0684", "series": 6, "repsMin": 2, "repsMax": 2, "unidad": "min", "fcObjetivo": {"min": 125, "max": 140}, "descansoSeg": 180},
          {"movimiento": "otro-sistema-cardiovascular", "ejercicioId": "3666", "series": 1, "repsMin": 5, "repsMax": 5, "unidad": "min", "fcObjetivo": {"min": 100, "max": 115}, "descansoSeg": 0}
        ]
      }
    ]
  },
  "nuevos_ejercicios": []
}
\`\`\``;

describe('validarImport — cardio nativo', () => {
  it('el día de intervalos del ejemplo valida y conserva unidad + fcObjetivo', () => {
    const r = validarImport(DIA_INTERVALOS, CAT);
    expect(r.ok).toBe(true);
    const ejercicios = r.rutina!.dias[0]!.ejercicios;
    expect(ejercicios[0]?.unidad).toBe('min');
    expect(ejercicios[1]?.fcObjetivo).toEqual({ min: 125, max: 140 });
    expect(ejercicios[1]?.series).toBe(6);
  });

  it('retrocompat: ejercicio sin unidad ni fcObjetivo sigue validando igual', () => {
    const viejo = `\`\`\`json
{
  "rutina": {
    "generadaEl": "2026-07-12", "seed": 1, "origen": "ia",
    "dias": [
      {
        "nombre": "Día 1", "enfoque": "pecho",
        "ejercicios": [
          {"movimiento": "empuje-pectorales", "ejercicioId": "0001", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 90}
        ]
      }
    ]
  }
}
\`\`\``;
    const r = validarImport(viejo, CAT);
    expect(r.ok).toBe(true);
    expect(r.rutina!.dias[0]!.ejercicios[0]?.unidad).toBeUndefined();
    expect(r.rutina!.dias[0]!.ejercicios[0]?.fcObjetivo).toBeUndefined();
  });

  it('unidad inválida → error', () => {
    const malo = DIA_INTERVALOS.replace('"unidad": "min"', '"unidad": "horas"');
    const r = validarImport(malo, CAT);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('unidad');
  });

  it('fcObjetivo inválido (min >= max o fuera de ppm humanas) → error', () => {
    const invertido = DIA_INTERVALOS.replace('{"min": 125, "max": 140}', '{"min": 150, "max": 120}');
    expect(validarImport(invertido, CAT).ok).toBe(false);

    const marciano = DIA_INTERVALOS.replace('{"min": 125, "max": 140}', '{"min": 10, "max": 400}');
    expect(validarImport(marciano, CAT).ok).toBe(false);
  });

  it('con unidad min acepta hasta 120; reps sigue limitado a 30', () => {
    const larga = DIA_INTERVALOS.replace('"repsMin": 5, "repsMax": 5, "unidad": "min"', '"repsMin": 60, "repsMax": 90, "unidad": "min"');
    expect(validarImport(larga, CAT).ok).toBe(true);

    const repsLocas = DIA_INTERVALOS.replace('"repsMin": 5, "repsMax": 5, "unidad": "min"', '"repsMin": 60, "repsMax": 90');
    expect(validarImport(repsLocas, CAT).ok).toBe(false);
  });
});

describe('motor y export con cardio en el banco', () => {
  const perfil: Perfil = {
    edad: 30,
    dias: 2,
    nivel: 'entrenado',
    objetivo: 'musculo',
    equipamiento: ['pesas', 'maquina', 'cuerpo'],
  };

  it('generarRutina de fuerza nunca mete ejercicios tipo cardio', () => {
    const rutina = generarRutina(perfil, CAT, 1);
    for (const e of rutina.dias.flatMap((d) => d.ejercicios)) {
      expect(CAT.find((c) => c.id === e.ejercicioId)?.tipo).toBe('fuerza');
    }
  });

  it('el export documenta unidad y fcObjetivo en el formato de respuesta', () => {
    const rutina = generarRutina(perfil, CAT, 1);
    const texto = generarExport(perfil, rutina, [], CAT, [], undefined, '2026-07-12');
    expect(texto).toContain('"unidad"');
    expect(texto).toContain('fcObjetivo');
    expect(texto).toMatch(/cardio.*['"]min['"]/s);
    expect(texto).toContain('"t":"cardio"');
  });
});
