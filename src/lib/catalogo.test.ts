// El catálogo es un dato, no código — pero hay tres cosas que si se rompen la
// app deja de funcionar en silencio, y ningún otro test las mira.
import { describe, it, expect } from 'vitest';
import catalogoSrc from '../data/ejercicios.json';
import catalogoPublic from '../../public/data/ejercicios.json';
import correccionesJson from '../../scripts/correcciones.json';
import { tieneDemo } from '../ui/datos';
import { alternativasDe } from './editor';
import { dosisInicial } from './editor';
import type { Ejercicio } from './tipos';

const CATALOGO = catalogoSrc as Ejercicio[];

describe('catálogo — las dos copias', () => {
  // src/data lo leen los tests, public/data lo sirve la app. Si divergen, los
  // tests pasan contra un catálogo que nadie usa.
  it('src/data y public/data tienen exactamente el mismo contenido', () => {
    expect(catalogoPublic).toEqual(catalogoSrc);
  });

  it('no hay ids repetidos', () => {
    const ids = CATALOGO.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe('modalidades de cardio', () => {
  const modalidades = CATALOGO.filter((e) => e.id.startsWith('CARDIO-'));

  it('están las 12 y son todas cardio sin demostración', () => {
    expect(modalidades).toHaveLength(12);
    for (const e of modalidades) {
      expect(e.tipo).toBe('cardio');
      // Sin este flag el <img> pide un GIF que no existe y se ve rota.
      expect(e.media).toBe('ninguna');
    }
  });

  it('la dosis inicial de un cardio se mide en minutos, no en reps', () => {
    expect(dosisInicial('cardio').unidad).toBe('min');
  });

  /**
   * El caso de uso que las motivó: estás en el día de cinta, fuiste a la bici.
   * "Cambiar ejercicio ⇄" ofrece los equivalentes del mismo movimiento cortados
   * en 12 por orden de catálogo — por eso las modalidades van al principio del
   * array. Si alguien las mueve al final, este test se pone en rojo.
   */
  it('desde el día de cinta, "Cambiar ejercicio ⇄" ofrece la bici', () => {
    const cinta = CATALOGO.find((e) => e.id === 'CARDIO-cinta-pendiente')!;
    const { equivalentes } = alternativasDe(CATALOGO, cinta, ['maquina']);
    expect(equivalentes.map((e) => e.id)).toContain('CARDIO-bici-z2');
  });

  it('las de aire libre no dependen de tener equipo', () => {
    const correr = CATALOGO.find((e) => e.id === 'CARDIO-correr-z2')!;
    // grupo 'cuerpo' = siempre disponible, aunque el perfil no tenga máquinas.
    const { equivalentes } = alternativasDe(CATALOGO, correr, []);
    expect(equivalentes.map((e) => e.id)).toContain('CARDIO-caminata-libre');
  });
});

// Hay ejercicios que vienen mal DESDE LA FUENTE: el GIF no es lo que dicen los
// pasos. El peor, reportado por JFD el 12/08: "estiramiento de talones de pie"
// muestra a alguien haciendo remo con mancuerna sobre un banco.
//
// Las correcciones viven en scripts/correcciones.json y las aplica
// preprocesar.py. Este test existe porque regenerar el catálogo sin aplicarlas
// las borraría en silencio, y nadie se enteraría hasta volver a leerlo en el gym.
describe('correcciones al catálogo de origen', () => {
  const correcciones = correccionesJson.correcciones as unknown as Array<{
    id: string; pasos?: string[]; media?: string; demoDudosa?: boolean;
  }>;
  const porId = new Map(CATALOGO.map((e) => [e.id, e]));

  it('todas están aplicadas en el catálogo', () => {
    expect(correcciones.length).toBeGreaterThan(0);
    for (const c of correcciones) {
      const e = porId.get(c.id);
      expect(e, `falta el ejercicio ${c.id}`).toBeDefined();
      if (c.pasos) expect(e!.pasos, `pasos de ${c.id}`).toEqual(c.pasos);
      if (c.media) expect(e!.media, `media de ${c.id}`).toBe(c.media);
      if (c.demoDudosa) expect(e!.demoDudosa, `demoDudosa de ${c.id}`).toBe(true);
    }
  });

  // El caso concreto que reportó JFD: el archivo de este id enseña otro
  // ejercicio (un remo con mancuerna). Se muestra igual, marcado —él lo
  // prefiere con aviso antes que sin nada— y la pantalla ofrece un equivalente.
  it('el estiramiento de talones de pie queda marcado como dibujo dudoso', () => {
    const e = porId.get('1398')!;
    expect(e.nombre_es).toContain('talones');
    expect(e.demoDudosa).toBe(true);
    expect(tieneDemo(e)).toBe(true);
  });
});

// JFD (16/08, observación en el 0739): "la que estoy haciendo es la prensa
// pero no 45 grados". La fuente no trae prensa horizontal a dos piernas, así
// que se agregó como extra (scripts/extras/extras.json) con la media de la
// máquina horizontal. Su registro histórico sigue en el 0739 — cambiarse o no
// es decisión de él y de su IA para la v11.
describe('prensa de piernas horizontal (extra)', () => {
  const prensa = CATALOGO.find((e) => e.id === 'EXTRA-prensa-horizontal');

  it('existe, es de máquina y tiene demostración', () => {
    expect(prensa).toBeDefined();
    expect(prensa!.grupo).toBe('maquina');
    expect(tieneDemo(prensa!)).toBe(true);
  });

  it('"Cambiar ejercicio ⇄" la ofrece desde la prensa de 45°', () => {
    const sled45 = CATALOGO.find((e) => e.id === '0739')!;
    const { equivalentes } = alternativasDe(CATALOGO, sled45, ['maquina']);
    expect(equivalentes.map((e) => e.id)).toContain('EXTRA-prensa-horizontal');
  });
});
