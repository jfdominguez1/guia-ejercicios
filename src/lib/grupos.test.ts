// Grupos de ejercicios armados por la IA que quedan guardados como bloques.
import { describe, it, expect } from 'vitest';
import { validarImport } from './ia';
import { registrarGrupo } from './registro';
import type { Ejercicio, GrupoGuardado } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo'], movimiento: string): Ejercicio {
  return {
    id, nombre_es: `ES ${id}`, nombre_en: id, tipo, grupo: 'cuerpo', equipment: 'x',
    zona: 'z', musculo: 'm', secundarios: [], pasos: [], movimiento, basico: true,
  };
}

const CAT = [
  ej('F1', 'fuerza', 'empuje-pectorales'),
  ej('E1', 'elongacion', 'elongacion-isquiotibiales'),
  ej('C1', 'cardio', 'otro-sistema-cardiovascular'),
];

const SOLO_GRUPOS = `Te armé dos bloques:

\`\`\`json
{
  "grupos": [
    {
      "nombre": "Movilidad de cadera",
      "descripcion": "Para mañanas o antes de la cinta",
      "ejercicios": [
        {"movimiento": "elongacion-isquiotibiales", "ejercicioId": "E1", "series": 2, "repsMin": 30, "repsMax": 40, "unidad": "seg", "descansoSeg": 10}
      ]
    },
    {
      "nombre": "Mini fuerza en viaje",
      "ejercicios": [
        {"movimiento": "empuje-pectorales", "ejercicioId": "F1", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 60}
      ]
    }
  ]
}
\`\`\``;

describe('validarImport — grupos', () => {
  it('respuesta SOLO con grupos (sin rutina) → ok, grupos validados, rutina undefined', () => {
    const r = validarImport(SOLO_GRUPOS, CAT);
    expect(r.ok).toBe(true);
    expect(r.rutina).toBeUndefined();
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos?.[0]?.nombre).toBe('Movilidad de cadera');
    expect(r.grupos?.[0]?.ejercicios[0]?.unidad).toBe('seg');
    expect(r.resumenCambios.join(' ')).toContain('Movilidad de cadera');
  });

  it('grupo con ejercicio inexistente o sin nombre → error claro', () => {
    const malo = SOLO_GRUPOS.replace('"E1"', '"NOEXISTE"');
    const r = validarImport(malo, CAT);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('NOEXISTE');

    const sinNombre = SOLO_GRUPOS.replace('"nombre": "Movilidad de cadera",', '');
    expect(validarImport(sinNombre, CAT).ok).toBe(false);
  });

  it('rutina + grupos en la misma respuesta → ambos vienen', () => {
    const conRutina = SOLO_GRUPOS.replace(
      '"grupos": [',
      `"rutina": {"generadaEl": "2026-07-13", "seed": 1, "origen": "ia", "dias": [
        {"nombre": "Día 1", "enfoque": "x", "ejercicios": [
          {"movimiento": "empuje-pectorales", "ejercicioId": "F1", "series": 3, "repsMin": 8, "repsMax": 12, "descansoSeg": 60}
        ]}
      ]},
      "grupos": [`,
    );
    const r = validarImport(conRutina, CAT);
    expect(r.ok).toBe(true);
    expect(r.rutina?.dias).toHaveLength(1);
    expect(r.grupos).toHaveLength(2);
  });

  it('sin grupos ni rutina → error (no hay nada que importar)', () => {
    const r = validarImport('```json\n{"nuevos_ejercicios": []}\n```', CAT);
    expect(r.ok).toBe(false);
  });
});

describe('registrarGrupo — ejecutar un bloque cuenta como sesión', () => {
  const GRUPO: GrupoGuardado = {
    nombre: 'Movilidad de cadera',
    ejercicios: [
      { movimiento: 'elongacion-isquiotibiales', ejercicioId: 'E1', series: 2, repsMin: 30, repsMax: 40, unidad: 'seg', descansoSeg: 10 },
    ],
  };

  it('registra sesión con el nombre del grupo y tipo derivado', () => {
    const s = registrarGrupo(GRUPO, CAT, '2026-07-13');
    expect(s.estado).toBe('hecha');
    expect(s.diaRutina).toBe('Movilidad de cadera');
    expect(s.tipo).toBe('elongacion');
    expect(s.diaIndex).toBeUndefined(); // no corre el ciclo de la rutina
  });
});
