// Regla de oro del design doc: si una regla del motor da rutina vacía para
// CUALQUIER perfil válido, es bug. Corre contra el catálogo real.
import { describe, it, expect } from 'vitest';
import { generarRutina, generarElongacion } from './motor';
import catalogoJson from '../data/ejercicios.json';
import type { Ejercicio, GrupoEquip, Nivel, Objetivo } from './tipos';

const CATALOGO = catalogoJson as Ejercicio[];

const EDADES = [22, 45, 60, 75];
const DIAS = [1, 2, 3, 4, 5, 6];
const NIVELES: Nivel[] = ['empiezo', 'entrenado'];
const OBJETIVOS: Objetivo[] = ['fuerza', 'musculo', 'tono'];
const EQUIPAMIENTOS: GrupoEquip[][] = [
  ['banda'],
  ['cuerpo'],
  ['pesas'],
  ['maquina'],
  ['pesas', 'maquina', 'banda', 'cuerpo', 'pelota', 'rodillo'],
];

describe('catálogo real — rutina nunca vacía', () => {
  it('todos los perfiles válidos generan días con 3+ ejercicios reales', () => {
    for (const edad of EDADES)
      for (const dias of DIAS)
        for (const nivel of NIVELES)
          for (const objetivo of OBJETIVOS)
            for (const equipamiento of EQUIPAMIENTOS) {
              const rutina = generarRutina(
                { edad, dias, nivel, objetivo, equipamiento },
                CATALOGO,
                1,
              );
              expect(rutina.dias).toHaveLength(dias);
              for (const dia of rutina.dias) {
                expect(dia.ejercicios.length).toBeGreaterThanOrEqual(3);
                for (const e of dia.ejercicios) {
                  expect(CATALOGO.some((c) => c.id === e.ejercicioId)).toBe(true);
                }
              }
            }
  });

  it('elongación nunca vacía para cualquier equipamiento', () => {
    for (const equipamiento of EQUIPAMIENTOS) {
      const dia = generarElongacion(
        { edad: 50, dias: 3, nivel: 'empiezo', objetivo: 'tono', equipamiento },
        CATALOGO,
        1,
      );
      expect(dia.ejercicios.length).toBeGreaterThanOrEqual(5);
    }
  });
});
