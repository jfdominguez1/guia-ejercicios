// Feature: elegir a mano qué día de la rutina se entrena hoy, pisando
// lo que propone el motor de rotación ("me tocaba piernas, hago espalda").
import { describe, it, expect } from 'vitest';
import { diaSugeridoDeHoy, opcionesDeDia, parsearDiaElegido, resolverDiaDeHoy, serializarDiaElegido } from './dia';
import { CONFIG_DEFAULT } from './registro';
import type { Ejercicio, Rutina, Sesion } from './tipos';

const HOY = '2026-07-20';

function rutina(cantidadDias = 3): Rutina {
  return {
    generadaEl: HOY,
    seed: 1,
    origen: 'reglas',
    dias: Array.from({ length: cantidadDias }, (_, i) => ({
      nombre: `Día ${i + 1}`,
      enfoque: `enfoque ${i + 1}`,
      ejercicios: [
        { movimiento: 'empuje-pectorales', ejercicioId: `F${i}`, series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 },
      ],
    })),
  };
}

describe('parsearDiaElegido', () => {
  it('devuelve el índice cuando el override es de hoy', () => {
    expect(parsearDiaElegido(serializarDiaElegido(HOY, 2), HOY, 3)).toBe(2);
  });

  it('ignora el override de un día anterior', () => {
    expect(parsearDiaElegido(serializarDiaElegido('2026-07-19', 2), HOY, 3)).toBeNull();
  });

  it('ignora índices fuera de la rutina (regenerada más corta)', () => {
    expect(parsearDiaElegido(serializarDiaElegido(HOY, 5), HOY, 3)).toBeNull();
    expect(parsearDiaElegido(serializarDiaElegido(HOY, -1), HOY, 3)).toBeNull();
  });

  it('tolera basura sin explotar', () => {
    expect(parsearDiaElegido(null, HOY, 3)).toBeNull();
    expect(parsearDiaElegido('no es json', HOY, 3)).toBeNull();
    expect(parsearDiaElegido('null', HOY, 3)).toBeNull();
    expect(parsearDiaElegido(JSON.stringify({ fecha: HOY, diaIndex: '2' }), HOY, 3)).toBeNull();
    expect(parsearDiaElegido(JSON.stringify({ fecha: HOY, diaIndex: 1.5 }), HOY, 3)).toBeNull();
  });
});

describe('resolverDiaDeHoy', () => {
  it('sin override usa el día que propone el motor', () => {
    const r = resolverDiaDeHoy(rutina(), 1, null);
    expect(r.diaIndex).toBe(1);
    expect(r.dia.nombre).toBe('Día 2');
    expect(r.esOverride).toBe(false);
  });

  it('con override entrena el día elegido', () => {
    const r = resolverDiaDeHoy(rutina(), 1, 2);
    expect(r.diaIndex).toBe(2);
    expect(r.dia.nombre).toBe('Día 3');
    expect(r.esOverride).toBe(true);
  });

  it('elegir el mismo día que tocaba no cuenta como override', () => {
    expect(resolverDiaDeHoy(rutina(), 1, 1).esOverride).toBe(false);
  });

  it('cae al día 0 si el sugerido ya no existe', () => {
    const r = resolverDiaDeHoy(rutina(2), 7, null);
    expect(r.diaIndex).toBe(0);
  });
});

describe('opcionesDeDia', () => {
  it('marca cuál tocaba y cuál está activo', () => {
    const opciones = opcionesDeDia(rutina(), 0, 2);
    expect(opciones).toHaveLength(3);
    expect(opciones[0]).toMatchObject({ index: 0, nombre: 'Día 1', cantidad: 1, sugerido: true, activo: false });
    expect(opciones[2]).toMatchObject({ index: 2, sugerido: false, activo: true });
  });
});

// Fuente única del día sugerido. El home y el wizard lo calculaban por separado
// y no daban lo mismo — de ahí que "Elongación A" abriera el día de bici.
describe('diaSugeridoDeHoy', () => {
  const tipo = (id: string, t: Ejercicio['tipo']): Ejercicio => ({
    id, nombre_es: id, nombre_en: id, tipo: t, grupo: 'cuerpo', equipment: 'x', zona: 'tren superior',
    musculo: 'x', secundarios: [], pasos: [], movimiento: 'x', basico: true,
  });
  const CATALOGO = [tipo('F1', 'fuerza'), tipo('C1', 'cardio'), tipo('E1', 'elongacion')];
  const paso = (id: string) => ({ movimiento: 'x', ejercicioId: id, series: 1, repsMin: 8, repsMax: 12, descansoSeg: 60 });
  const v10: Rutina = {
    generadaEl: HOY, seed: 1, origen: 'reglas',
    dias: [
      { nombre: 'Fuerza A', enfoque: 'x', ejercicios: [paso('F1')] },
      { nombre: 'Cinta', enfoque: 'x', ejercicios: [paso('C1')] },
      { nombre: 'Fuerza B', enfoque: 'x', ejercicios: [paso('F1')] },
      { nombre: 'Bici', enfoque: 'x', ejercicios: [paso('C1')] },
      { nombre: 'Elongación A', enfoque: 'x', ejercicios: [paso('E1')] },
    ],
  };

  it('propone el carril más atrasado y no el que sigue en la rotación por fuerza', () => {
    // Último día de fuerza: índice 2. La rotación vieja pedía el 3 (bici).
    // La meta va explícita: el escenario tiene que ser el mismo aunque JFD
    // cambie su objetivo semanal, que es un dato suyo y no del test.
    const config = { ...CONFIG_DEFAULT, metaSemanal: { fuerza: 1, cardio: 1, elongacion: 2 } };
    const sesiones: Sesion[] = [{ fecha: '2026-07-19', tipo: 'fuerza', estado: 'hecha', diaIndex: 2 }];
    expect(diaSugeridoDeHoy(v10, sesiones, CATALOGO, HOY, config)).toBe(4);
  });

  it('sin rutina no explota', () => {
    expect(diaSugeridoDeHoy(null, [], CATALOGO, HOY, CONFIG_DEFAULT)).toBe(0);
  });
});
