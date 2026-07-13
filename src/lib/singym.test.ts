// C3: "Hoy sin gym" (modo viaje) — convierte la sesión del día a cuerpo/banda.
// Override de ESE día: no cambia la rutina guardada ni el perfil.
import { describe, it, expect } from 'vitest';
import { convertirDiaSinGym } from './singym';
import type { DiaRutina, Ejercicio, Perfil } from './tipos';

function ej(id: string, grupo: Ejercicio['grupo'], tipo: Ejercicio['tipo'], movimiento: string, extras: Partial<Ejercicio> = {}): Ejercicio {
  return {
    id, nombre_es: `ES ${id}`, nombre_en: id, tipo, grupo, equipment: grupo,
    zona: 'z', musculo: movimiento.split('-').slice(-1)[0] ?? '', secundarios: [],
    pasos: [], movimiento, basico: true, ...extras,
  };
}

const CAT: Ejercicio[] = [
  // empuje pecho: máquina + variante cuerpo
  ej('M1', 'maquina', 'fuerza', 'empuje-pectorales'),
  ej('C1', 'cuerpo', 'fuerza', 'empuje-pectorales'),
  // tracción: pesas + variante banda
  ej('P1', 'pesas', 'fuerza', 'traccion-dorsales'),
  ej('B1', 'banda', 'fuerza', 'traccion-dorsales'),
  // curl femoral máquina: SIN variante del movimiento, pero hay mismo músculo en cuerpo
  ej('M2', 'maquina', 'fuerza', 'curl-isquiotibiales'),
  ej('C2', 'cuerpo', 'fuerza', 'cadera-isquiotibiales'),
  // extensión tríceps máquina: sin equivalente de ningún tipo
  ej('M3', 'maquina', 'fuerza', 'extension-triceps'),
  // cardio: cinta (máquina) + correr (cuerpo, sin impacto) + burpee (impacto)
  ej('CINTA', 'maquina', 'cardio', 'otro-sistema-cardiovascular', { impacto: false }),
  ej('RUN', 'cuerpo', 'cardio', 'otro-sistema-cardiovascular', { impacto: false }),
  ej('BURPEE', 'cuerpo', 'cardio', 'otro-sistema-cardiovascular', { impacto: true }),
];

const CUSTOM_CAMINATA = ej('CUSTOM-caminata-z2', 'cuerpo', 'cardio', 'otro-sistema-cardiovascular', {
  impacto: false,
  custom: true,
});

const PERFIL: Perfil = { edad: 45, dias: 3, nivel: 'entrenado', objetivo: 'musculo', equipamiento: ['maquina', 'pesas'] };

function eR(ejercicioId: string, movimiento: string, extras: Record<string, unknown> = {}) {
  return { movimiento, ejercicioId, series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90, ...extras };
}

const DIA_GYM: DiaRutina = {
  nombre: 'Día 1 — Fuerza A',
  enfoque: 'full',
  ejercicios: [
    eR('M1', 'empuje-pectorales'),
    eR('P1', 'traccion-dorsales'),
    eR('M2', 'curl-isquiotibiales'),
  ],
};

describe('convertirDiaSinGym', () => {
  it('día todo máquina/pesas → sesión completa en cuerpo/banda con mismas series/reps', () => {
    const { dia, avisos } = convertirDiaSinGym(DIA_GYM, CAT, [], PERFIL);
    expect(avisos).toEqual([]);
    expect(dia.ejercicios.map((e) => e.ejercicioId)).toEqual(['C1', 'B1', 'C2']);
    for (const e of dia.ejercicios) {
      expect(e.series).toBe(3);
      expect(e.repsMin).toBe(8);
      expect(e.repsMax).toBe(12);
    }
    // no muta el original
    expect(DIA_GYM.ejercicios[0]?.ejercicioId).toBe('M1');
  });

  it('lo que ya es cuerpo/banda queda igual', () => {
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('C1', 'empuje-pectorales')] };
    const r = convertirDiaSinGym(dia, CAT, [], PERFIL);
    expect(r.dia.ejercicios[0]?.ejercicioId).toBe('C1');
  });

  it('sin variante del movimiento cae a mismo músculo; sin nada → omite con aviso', () => {
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('M2', 'curl-isquiotibiales'), eR('M3', 'extension-triceps')] };
    const { dia: convertido, avisos } = convertirDiaSinGym(dia, CAT, [], PERFIL);
    expect(convertido.ejercicios.map((e) => e.ejercicioId)).toEqual(['C2']);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('ES M3');
    expect(avisos[0]).toContain('sin equivalente');
  });

  it('cardio de cinta → prefiere el CUSTOM del usuario, mismos minutos y fcObjetivo', () => {
    const dia: DiaRutina = {
      ...DIA_GYM,
      ejercicios: [eR('CINTA', 'otro-sistema-cardiovascular', { series: 1, repsMin: 40, repsMax: 40, unidad: 'min', fcObjetivo: { min: 105, max: 125 } })],
    };
    const r = convertirDiaSinGym(dia, CAT, [CUSTOM_CAMINATA], PERFIL);
    const e = r.dia.ejercicios[0]!;
    expect(e.ejercicioId).toBe('CUSTOM-caminata-z2');
    expect(e.repsMin).toBe(40);
    expect(e.unidad).toBe('min');
    expect(e.fcObjetivo).toEqual({ min: 105, max: 125 });
  });

  it('sin customs, cardio de cinta cae a la variante cuerpo (Correr)', () => {
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('CINTA', 'otro-sistema-cardiovascular', { unidad: 'min' })] };
    const r = convertirDiaSinGym(dia, CAT, [], PERFIL);
    expect(['RUN', 'BURPEE']).toContain(r.dia.ejercicios[0]?.ejercicioId);
  });

  it('A3: perfil empiezo y 50+ nunca recibe cardio de impacto en el swap', () => {
    const mayor: Perfil = { ...PERFIL, nivel: 'empiezo', edad: 52 };
    const soloImpactoYRun = CAT.filter((e) => e.tipo !== 'cardio' || ['BURPEE', 'RUN', 'CINTA'].includes(e.id));
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('CINTA', 'otro-sistema-cardiovascular', { unidad: 'min' })] };
    for (let i = 0; i < 5; i++) {
      const r = convertirDiaSinGym(dia, soloImpactoYRun, [], mayor);
      expect(r.dia.ejercicios[0]?.ejercicioId).toBe('RUN');
    }
  });

  it('A3: entrenado o <50 puede recibir impacto (no se filtra)', () => {
    const soloBurpee = CAT.filter((e) => e.tipo !== 'cardio' || ['BURPEE', 'CINTA'].includes(e.id));
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('CINTA', 'otro-sistema-cardiovascular', { unidad: 'min' })] };
    const r = convertirDiaSinGym(dia, soloBurpee, [], PERFIL);
    expect(r.dia.ejercicios[0]?.ejercicioId).toBe('BURPEE');
  });

  it('empiezo/50+ con solo impacto disponible → omite con aviso (no fuerza el burpee)', () => {
    const mayor: Perfil = { ...PERFIL, nivel: 'empiezo', edad: 52 };
    const soloBurpee = CAT.filter((e) => e.tipo !== 'cardio' || ['BURPEE', 'CINTA'].includes(e.id));
    const dia: DiaRutina = { ...DIA_GYM, ejercicios: [eR('CINTA', 'otro-sistema-cardiovascular', { unidad: 'min' })] };
    const r = convertirDiaSinGym(dia, soloBurpee, [], mayor);
    expect(r.dia.ejercicios).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
  });

  it('no repite el mismo ejercicio para dos slots', () => {
    const dia: DiaRutina = {
      ...DIA_GYM,
      ejercicios: [eR('M1', 'empuje-pectorales'), eR('C1', 'empuje-pectorales')],
    };
    const r = convertirDiaSinGym(dia, CAT, [], PERFIL);
    const ids = r.dia.ejercicios.map((e) => e.ejercicioId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
