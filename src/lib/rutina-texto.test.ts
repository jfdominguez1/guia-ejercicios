// Feature: compartir la rutina como texto legible.
// Lo que puede romperse sin que se note: que un ejercicio que ya no está en el
// catálogo deje una línea vacía, o que cardio/elongación se muestren como si
// fueran repeticiones de fuerza.
import { describe, it, expect } from 'vitest';
import { lineaEjercicio, textoDia, textoRutina } from './rutina-texto';
import type { Ejercicio, EjercicioRutina, Rutina } from './tipos';

function ej(id: string, nombre: string, tipo: Ejercicio['tipo']): Ejercicio {
  return {
    id,
    nombre_es: nombre,
    nombre_en: nombre,
    tipo,
    grupo: 'pesas',
    equipment: 'x',
    zona: 'tren superior',
    musculo: 'pectorales',
    secundarios: [],
    pasos: [],
    movimiento: `mov-${id}`,
    basico: true,
  };
}

const PRESS = ej('F1', 'Press banca', 'fuerza');
const CINTA = ej('C1', 'Cinta', 'cardio');
const ISQUIO = ej('E1', 'Elongación isquios', 'elongacion');
const CATALOGO = [PRESS, CINTA, ISQUIO];

const PLAN_PRESS: EjercicioRutina = {
  movimiento: 'mov-F1',
  ejercicioId: 'F1',
  series: 3,
  repsMin: 8,
  repsMax: 12,
  descansoSeg: 90,
};

function rutina(dias: Rutina['dias']): Rutina {
  return { generadaEl: '2026-07-20', seed: 1, origen: 'ia', dias };
}

describe('lineaEjercicio', () => {
  it('arma nombre, dosis y descanso', () => {
    expect(lineaEjercicio(PLAN_PRESS, CATALOGO)).toBe(
      '• Press banca — 3× 8-12 reps · descanso 90s',
    );
  });

  it('usa el id si el ejercicio ya no está en el catálogo (no deja la línea vacía)', () => {
    const linea = lineaEjercicio({ ...PLAN_PRESS, ejercicioId: 'BORRADO' }, CATALOGO);
    expect(linea).toContain('BORRADO');
    expect(linea).toContain('3× 8-12 reps');
  });

  it('cardio por bloques: minutos, recuperación y zona de FC', () => {
    const linea = lineaEjercicio(
      {
        movimiento: 'mov-C1',
        ejercicioId: 'C1',
        series: 4,
        repsMin: 2,
        repsMax: 2,
        unidad: 'min',
        descansoSeg: 60,
        fcObjetivo: { min: 140, max: 155 },
      },
      CATALOGO,
    );
    expect(linea).toBe('• Cinta — 4× 2 min · recuperación 60s · 🫀 140-155 ppm');
  });

  it('elongación sin unidad se lee en segundos', () => {
    const linea = lineaEjercicio(
      { movimiento: 'mov-E1', ejercicioId: 'E1', series: 2, repsMin: 30, repsMax: 30, descansoSeg: 15 },
      CATALOGO,
    );
    expect(linea).toContain('2× 30 seg');
  });
});

describe('textoDia', () => {
  it('encabeza con nombre y enfoque', () => {
    const r = rutina([{ nombre: 'Día 1', enfoque: 'empuje', ejercicios: [PLAN_PRESS] }]);
    expect(textoDia(r, 0, CATALOGO)).toBe(
      'Día 1 · empuje\n• Press banca — 3× 8-12 reps · descanso 90s',
    );
  });

  it('no repite el enfoque si es igual al nombre', () => {
    const r = rutina([{ nombre: 'Elongación', enfoque: 'Elongación', ejercicios: [PLAN_PRESS] }]);
    expect(textoDia(r, 0, CATALOGO).split('\n')[0]).toBe('Elongación');
  });

  it('un día vacío se lee como descanso, no como un hueco', () => {
    const r = rutina([{ nombre: 'Día 4', enfoque: 'libre', ejercicios: [] }]);
    expect(textoDia(r, 0, CATALOGO)).toContain('(descanso)');
  });

  it('día inexistente devuelve vacío', () => {
    expect(textoDia(rutina([]), 3, CATALOGO)).toBe('');
  });
});

describe('textoRutina', () => {
  it('lista todos los días con encabezado y sin markdown', () => {
    const r = rutina([
      { nombre: 'Día 1', enfoque: 'empuje', ejercicios: [PLAN_PRESS] },
      { nombre: 'Día 2', enfoque: 'tracción', ejercicios: [PLAN_PRESS] },
    ]);
    const texto = textoRutina(r, CATALOGO);
    expect(texto.startsWith('💪 Mi rutina — 2 días')).toBe(true);
    expect(texto).toContain('Día 1 · empuje');
    expect(texto).toContain('Día 2 · tracción');
    expect(texto).not.toContain('**');
  });

  it('singular con un solo día', () => {
    const r = rutina([{ nombre: 'Día único', enfoque: 'full body', ejercicios: [PLAN_PRESS] }]);
    expect(textoRutina(r, CATALOGO)).toContain('1 día');
  });
});
