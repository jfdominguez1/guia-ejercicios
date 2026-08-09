// Feature: el cardio de un día de rutina es su propia sesión, con sus datos.
// Los casos salen del backup del 09/08, donde dos cardios reales se perdieron.
import { describe, it, expect } from 'vitest';
import {
  cardioPendiente,
  cardioYaRegistrado,
  etiquetaModalidad,
  modalidadDe,
  partirDia,
  sesionDeCardio,
  validarCardio,
  MODALIDADES,
} from './cardio';
import type { DiaRutina, Ejercicio, EjercicioRutina, Sesion } from './tipos';

function ej(id: string, tipo: Ejercicio['tipo']): Ejercicio {
  return {
    id, nombre_es: id, nombre_en: id, tipo, grupo: 'cuerpo', equipment: 'x', zona: 'z',
    musculo: 'm', secundarios: [], pasos: [], movimiento: 'mov', basico: false,
  };
}

const CATALOGO = [
  ej('CARDIO-bici-z2', 'cardio'),
  ej('CARDIO-cinta-pendiente', 'cardio'),
  ej('ST-Kneeling_Hip_Flexor', 'elongacion'),
  ej('ST-Ankle_On_The_Knee', 'elongacion'),
  ej('0739', 'fuerza'),
];

function paso(ejercicioId: string): EjercicioRutina {
  return { movimiento: 'mov', ejercicioId, series: 1, repsMin: 40, repsMax: 50, descansoSeg: 0 };
}

/** El Día 4 real de JFD: un cardio y cuatro elongaciones. */
const DIA_4: DiaRutina = {
  nombre: 'Día 4 — Bici: zona 2',
  enfoque: 'cardio',
  ejercicios: [paso('CARDIO-bici-z2'), paso('ST-Kneeling_Hip_Flexor'), paso('ST-Ankle_On_The_Knee')],
};

describe('partirDia', () => {
  it('separa el cardio del resto conservando el orden', () => {
    const { cardio, resto } = partirDia(DIA_4, CATALOGO);
    expect(cardio.map((e) => e.ejercicioId)).toEqual(['CARDIO-bici-z2']);
    expect(resto.map((e) => e.ejercicioId)).toEqual([
      'ST-Kneeling_Hip_Flexor',
      'ST-Ankle_On_The_Knee',
    ]);
  });

  it('un día sin cardio queda igual que antes', () => {
    const dia: DiaRutina = { nombre: 'Día 1', enfoque: 'fuerza', ejercicios: [paso('0739')] };
    const { cardio, resto } = partirDia(dia, CATALOGO);
    expect(cardio).toEqual([]);
    expect(resto.map((e) => e.ejercicioId)).toEqual(['0739']);
  });

  it('un día que es solo cardio no deja resto', () => {
    const dia: DiaRutina = { nombre: 'Z2', enfoque: 'cardio', ejercicios: [paso('CARDIO-bici-z2')] };
    expect(partirDia(dia, CATALOGO).resto).toEqual([]);
  });

  it('un ejercicio que no está en el catálogo va al resto, no se pierde', () => {
    const dia: DiaRutina = { nombre: 'X', enfoque: '', ejercicios: [paso('BORRADO-999')] };
    expect(partirDia(dia, CATALOGO).resto.map((e) => e.ejercicioId)).toEqual(['BORRADO-999']);
  });
});

describe('modalidadDe', () => {
  it('deriva la modalidad del ejercicio del catálogo', () => {
    expect(modalidadDe('CARDIO-bici-z2')).toBe('bici-fija');
    expect(modalidadDe('CARDIO-cinta-pendiente')).toBe('cinta');
    expect(modalidadDe('CARDIO-correr-intervalos')).toBe('corrida');
    expect(modalidadDe('CARDIO-caminata-libre')).toBe('caminata');
    expect(modalidadDe('CARDIO-natacion')).toBe('natacion');
  });

  it('lo que no reconoce cae en "otro" en vez de inventar', () => {
    expect(modalidadDe('CARDIO-libre')).toBe('otro');
    expect(modalidadDe('CUSTOM-lo-que-sea')).toBe('otro');
  });

  it('la bici arranca en fija, que es lo que hace JFD', () => {
    // El pedido textual: "Fue bici fija. Ponelo como opción."
    expect(modalidadDe('CARDIO-bici-intervalos')).toBe('bici-fija');
    expect(MODALIDADES.map((m) => m.valor)).toContain('bici-calle');
  });
});

describe('etiquetaModalidad', () => {
  it('nombra las modalidades nuevas', () => {
    expect(etiquetaModalidad('bici-fija')).toBe('Bici fija');
    expect(etiquetaModalidad('bici-calle')).toBe('Bici de calle');
  });

  it('sigue leyendo las sesiones viejas guardadas como "bicicleta"', () => {
    // La sesión del 09/08 quedó con tipo 'bicicleta'; no se toca el dato.
    expect(etiquetaModalidad('bicicleta')).toBe('Bici');
  });
});

describe('cardioYaRegistrado / cardioPendiente', () => {
  const sesionCardio: Sesion = {
    fecha: '2026-08-09',
    tipo: 'cardio',
    estado: 'hecha',
    cardio: { tipo: 'bici-fija', minutos: 30 },
    items: [{ ejercicioId: 'CARDIO-bici-z2', variante: 'maquina', series: [{ reps: 30, minutos: 30 }] }],
  };

  it('reconoce el cardio ya registrado hoy', () => {
    expect(cardioYaRegistrado([sesionCardio], '2026-08-09', 'CARDIO-bici-z2')).toBe(true);
  });

  it('no lo confunde con el de otro día ni con otra modalidad', () => {
    expect(cardioYaRegistrado([sesionCardio], '2026-08-10', 'CARDIO-bici-z2')).toBe(false);
    expect(cardioYaRegistrado([sesionCardio], '2026-08-09', 'CARDIO-cinta-pendiente')).toBe(false);
  });

  it('no vuelve a pedir el cardio si ya se registró y volviste a entrar', () => {
    const tramos = partirDia(DIA_4, CATALOGO);
    expect(cardioPendiente(tramos, [sesionCardio], '2026-08-09')).toEqual([]);
    expect(cardioPendiente(tramos, [], '2026-08-09')).toHaveLength(1);
  });
});

describe('validarCardio', () => {
  it('acepta un cardio normal', () => {
    expect(validarCardio({ modalidad: 'bici-fija', minutos: 30, fcPromedio: 112 })).toEqual({});
  });

  it('los minutos son obligatorios: sin ellos la sesión no dice nada', () => {
    expect(validarCardio({ minutos: 0 }).minutos).toBeTruthy();
    expect(validarCardio({}).minutos).toBeTruthy();
    expect(validarCardio({ minutos: 700 }).minutos).toBeTruthy();
  });

  it('la FC es opcional pero si viene tiene que ser plausible', () => {
    expect(validarCardio({ minutos: 30 }).fcPromedio).toBeUndefined();
    expect(validarCardio({ minutos: 30, fcPromedio: 20 }).fcPromedio).toBeTruthy();
    expect(validarCardio({ minutos: 30, fcPromedio: 300 }).fcPromedio).toBeTruthy();
  });
});

describe('sesionDeCardio', () => {
  const sesion = sesionDeCardio(
    paso('CARDIO-bici-z2'),
    { modalidad: 'bici-fija', minutos: 30, fcPromedio: 112 },
    { fecha: '2026-08-09', diaIndex: 3, nombreDia: 'Día 4 — Bici: zona 2', nombre: 'Bici — zona 2' },
  );

  it('queda enganchada al día de rutina', () => {
    // Esto es lo que faltaba el 09/08: la bici quedó suelta, sin diaIndex.
    expect(sesion.diaIndex).toBe(3);
    expect(sesion.diaRutina).toBe('Día 4 — Bici: zona 2');
  });

  it('es del tipo correcto sin depender de qué más se registró ese día', () => {
    expect(sesion.tipo).toBe('cardio');
  });

  it('guarda la modalidad, los minutos y los bpm', () => {
    expect(sesion.cardio).toEqual({ tipo: 'bici-fija', minutos: 30 });
    expect(sesion.fcPromedio).toBe(112);
  });

  it('deja el ejercicio en items para que aparezca en el historial', () => {
    expect(sesion.items).toEqual([
      {
        ejercicioId: 'CARDIO-bici-z2',
        variante: 'maquina',
        nombre: 'Bici — zona 2',
        series: [{ reps: 30, minutos: 30 }],
      },
    ]);
  });

  it('sin FC no inventa el campo', () => {
    const sinFc = sesionDeCardio(
      paso('CARDIO-bici-z2'),
      { modalidad: 'bici-fija', minutos: 30 },
      { fecha: '2026-08-09', nombreDia: 'Libre' },
    );
    expect('fcPromedio' in sinFc).toBe(false);
    expect('diaIndex' in sinFc).toBe(false);
  });
});
