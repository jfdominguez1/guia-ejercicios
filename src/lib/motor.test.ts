import { describe, it, expect } from 'vitest';
import { generarRutina, generarElongacion } from './motor';
import type { Ejercicio, GrupoEquip, Perfil, TipoEjercicio } from './tipos';

let contador = 0;
function ej(
  grupo: GrupoEquip,
  movimiento: string,
  extras: Partial<Ejercicio> = {},
): Ejercicio {
  contador += 1;
  const id = `T${String(contador).padStart(3, '0')}`;
  return {
    id,
    nombre_es: `Ejercicio ${id}`,
    nombre_en: `exercise ${id}`,
    tipo: 'fuerza' as TipoEjercicio,
    grupo,
    equipment: grupo,
    zona: 'Zona',
    musculo: movimiento.split('-').slice(-1)[0] ?? '',
    secundarios: [],
    pasos: ['paso 1'],
    movimiento,
    basico: false,
    ...extras,
  };
}

// Catálogo de prueba: cada movimiento clave en las 4 variantes de fuerza,
// con versión básica y no básica, + elongación.
const MOVIMIENTOS = [
  'piernas-empuje-cuadriceps',
  'empuje-pectorales',
  'traccion-dorsales',
  'traccion-espalda-alta',
  'cadera-gluteos',
  'empuje-deltoides',
  'core-abdominales',
  'curl-biceps',
  'curl-isquiotibiales',
  'extension-triceps',
  'extension-cuadriceps',
  'elevacion-deltoides',
  'elevacion-pantorrillas',
  'elevacion-pectorales',
  'otro-trapecios',
];
const GRUPOS_FUERZA: GrupoEquip[] = ['banda', 'pesas', 'maquina', 'cuerpo'];

const CAT: Ejercicio[] = [
  ...MOVIMIENTOS.flatMap((mov) =>
    GRUPOS_FUERZA.flatMap((grupo) => [
      ej(grupo, mov, { basico: true }),
      ej(grupo, mov, { basico: false }),
    ]),
  ),
  // elongación
  ej('cuerpo', 'elongacion-isquiotibiales', { tipo: 'elongacion', basico: true }),
  ej('cuerpo', 'elongacion-cuadriceps', { tipo: 'elongacion', basico: true }),
  ej('cuerpo', 'elongacion-pantorrillas', { tipo: 'elongacion', basico: true }),
  ej('cuerpo', 'elongacion-dorsales', { tipo: 'elongacion', basico: true }),
  ej('cuerpo', 'elongacion-pectorales', { tipo: 'elongacion', basico: true }),
  ej('cuerpo', 'elongacion-cuello', { tipo: 'elongacion', basico: true }),
  ej('banda', 'elongacion-isquiotibiales', { tipo: 'elongacion', basico: true }),
  ej('pelota', 'elongacion-dorsales', { tipo: 'elongacion' }),
  ej('rodillo', 'elongacion-espalda', { tipo: 'elongacion' }),
];

const BASE: Perfil = {
  edad: 30,
  dias: 3,
  nivel: 'entrenado',
  objetivo: 'musculo',
  equipamiento: ['pesas'],
};

function todosLosEjercicios(perfil: Perfil, seed = 1) {
  const rutina = generarRutina(perfil, CAT, seed);
  return rutina.dias.flatMap((d) => d.ejercicios);
}

function buscar(id: string): Ejercicio {
  const encontrado = CAT.find((e) => e.id === id);
  if (!encontrado) throw new Error(`id ${id} no está en CAT`);
  return encontrado;
}

describe('generarRutina — split por frecuencia', () => {
  it('genera tantos días como frecuencia (1 a 6)', () => {
    for (const dias of [1, 2, 3, 4, 5, 6]) {
      const rutina = generarRutina({ ...BASE, dias }, CAT, 1);
      expect(rutina.dias).toHaveLength(dias);
      for (const dia of rutina.dias) {
        expect(dia.ejercicios.length).toBeGreaterThanOrEqual(4);
        expect(dia.ejercicios.length).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('generarRutina — perfiles límite', () => {
  it('68 años, 1 día, solo banda → rutina válida no vacía, todo banda o cuerpo', () => {
    const perfil: Perfil = {
      edad: 68,
      dias: 1,
      nivel: 'empiezo',
      objetivo: 'tono',
      equipamiento: ['banda'],
    };
    const ejercicios = todosLosEjercicios(perfil);
    expect(ejercicios.length).toBeGreaterThan(0);
    for (const e of ejercicios) {
      expect(['banda', 'cuerpo']).toContain(buscar(e.ejercicioId).grupo);
    }
  });

  it('cualquier combinación válida de perfil da rutina no vacía', () => {
    for (const dias of [1, 3, 6]) {
      for (const nivel of ['empiezo', 'entrenado'] as const) {
        for (const equipamiento of [['banda'], ['cuerpo'], ['pesas', 'maquina']] as GrupoEquip[][]) {
          for (const edad of [25, 50, 70]) {
            const ejercicios = todosLosEjercicios({
              edad, dias, nivel, objetivo: 'musculo', equipamiento,
            });
            expect(ejercicios.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('generarRutina — regla de edad', () => {
  it('edad 60: nunca pesas si hay alternativa maquina/banda, reps >= 12, un ejercicio menos', () => {
    const perfil: Perfil = { ...BASE, edad: 60, equipamiento: ['pesas', 'maquina', 'banda'] };
    const rutina = generarRutina(perfil, CAT, 1);
    const joven = generarRutina({ ...perfil, edad: 30 }, CAT, 1);
    for (const e of rutina.dias.flatMap((d) => d.ejercicios)) {
      expect(buscar(e.ejercicioId).grupo).not.toBe('pesas');
      expect(e.repsMin).toBeGreaterThanOrEqual(12);
    }
    for (let i = 0; i < rutina.dias.length; i++) {
      const dia = rutina.dias[i]!;
      const diaJoven = joven.dias[i]!;
      expect(dia.ejercicios.length).toBe(diaJoven.ejercicios.length - 1);
    }
  });

  it('edad 45: piso de reps 8', () => {
    const perfil: Perfil = { ...BASE, edad: 45, objetivo: 'fuerza' };
    for (const e of todosLosEjercicios(perfil)) {
      expect(e.repsMin).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('generarRutina — regla de objetivo', () => {
  it('fuerza → 4 series de 5-6; tono → 3 de 12-15 (edad <40)', () => {
    for (const e of todosLosEjercicios({ ...BASE, objetivo: 'fuerza' })) {
      expect(e.series).toBe(4);
      expect(e.repsMin).toBe(5);
      expect(e.repsMax).toBe(6);
    }
    for (const e of todosLosEjercicios({ ...BASE, objetivo: 'tono' })) {
      expect(e.series).toBe(3);
      expect(e.repsMin).toBe(12);
      expect(e.repsMax).toBe(15);
    }
  });
});

describe('generarRutina — regla de nivel', () => {
  it("nivel 'empiezo' → solo ejercicios basico:true", () => {
    for (const e of todosLosEjercicios({ ...BASE, nivel: 'empiezo' })) {
      expect(buscar(e.ejercicioId).basico).toBe(true);
    }
  });
});

describe('generarRutina — determinismo y equipamiento', () => {
  it('mismo perfil+seed → misma rutina; seed distinto → distinta', () => {
    const a = generarRutina(BASE, CAT, 42);
    const b = generarRutina(BASE, CAT, 42);
    const c = generarRutina(BASE, CAT, 43);
    expect(a.dias).toEqual(b.dias);
    expect(JSON.stringify(a.dias)).not.toBe(JSON.stringify(c.dias));
  });

  it("nunca un grupo fuera del equipamiento (excepto 'cuerpo', siempre permitido)", () => {
    for (const e of todosLosEjercicios({ ...BASE, equipamiento: ['maquina'] })) {
      expect(['maquina', 'cuerpo']).toContain(buscar(e.ejercicioId).grupo);
    }
  });

  it('sin ejercicios repetidos dentro del mismo día', () => {
    const rutina = generarRutina({ ...BASE, dias: 6, equipamiento: ['pesas', 'maquina'] }, CAT, 7);
    for (const dia of rutina.dias) {
      const ids = dia.ejercicios.map((e) => e.ejercicioId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('generarElongacion', () => {
  it('sesión corta de solo elongación, 5-7 ejercicios, segundos de mantenimiento', () => {
    const dia = generarElongacion({ ...BASE, equipamiento: ['pesas', 'pelota'] }, CAT, 1);
    expect(dia.ejercicios.length).toBeGreaterThanOrEqual(5);
    expect(dia.ejercicios.length).toBeLessThanOrEqual(7);
    for (const e of dia.ejercicios) {
      const info = buscar(e.ejercicioId);
      expect(info.tipo).toBe('elongacion');
      expect(['cuerpo', 'pelota']).toContain(info.grupo);
      expect(e.repsMin).toBeGreaterThanOrEqual(15); // segundos
      expect(e.series).toBeLessThanOrEqual(2);
    }
  });

  it('es determinística por seed y nunca vacía aunque solo haya cuerpo', () => {
    const perfil: Perfil = { ...BASE, equipamiento: ['pesas'] };
    expect(generarElongacion(perfil, CAT, 5)).toEqual(generarElongacion(perfil, CAT, 5));
    expect(generarElongacion(perfil, CAT, 5).ejercicios.length).toBeGreaterThan(0);
  });
});
