// El catálogo es un dato, no código — pero hay tres cosas que si se rompen la
// app deja de funcionar en silencio, y ningún otro test las mira.
import { describe, it, expect } from 'vitest';
import catalogoSrc from '../data/ejercicios.json';
import catalogoPublic from '../../public/data/ejercicios.json';
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
