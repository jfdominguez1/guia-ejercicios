import { describe, it, expect } from 'vitest';
import { cambiosDeBloques, pareceRenombre } from './import-bloques';
import type { GrupoGuardado } from './tipos';

const bloque = (nombre: string): GrupoGuardado => ({ nombre, descripcion: '', ejercicios: [] });

describe('cambiosDeBloques', () => {
  it('separa lo que pisa, lo que agrega y lo que no toca', () => {
    const cambios = cambiosDeBloques(
      [bloque('Calentamiento'), bloque('Viaje')],
      [bloque('Calentamiento'), bloque('Mañanas')],
    );
    expect(cambios).toEqual({
      pisa: ['Calentamiento'],
      agrega: ['Mañanas'],
      intactos: ['Viaje'],
    });
  });

  it('un archivo sin bloques no toca nada', () => {
    const cambios = cambiosDeBloques([bloque('Viaje')], []);
    expect(cambios).toEqual({ pisa: [], agrega: [], intactos: ['Viaje'] });
  });

  /**
   * El caso real del archivo v8: renombró "Elongación post-caminata (10 min)"
   * a "Elongación post-cardio · 10 min (bici o caminata)". Como la fusión es
   * por nombre, el viejo no se renombra — quedan los dos.
   */
  it('un renombre deja el bloque viejo huérfano, y se ve', () => {
    const cambios = cambiosDeBloques(
      [bloque('Elongación post-caminata (10 min)'), bloque('Calentamiento pre-fuerza (5 min)')],
      [bloque('Elongación post-cardio · 10 min (bici o caminata)'), bloque('Calentamiento pre-fuerza (5 min)')],
    );
    expect(cambios.intactos).toEqual(['Elongación post-caminata (10 min)']);
    expect(cambios.agrega).toEqual(['Elongación post-cardio · 10 min (bici o caminata)']);
    expect(pareceRenombre(cambios)).toBe(true);
  });

  it('agregar un bloque sin tener ninguno guardado no parece renombre', () => {
    expect(pareceRenombre(cambiosDeBloques([], [bloque('Mañanas')]))).toBe(false);
  });
});
