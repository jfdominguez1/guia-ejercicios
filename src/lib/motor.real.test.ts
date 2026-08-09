// Regla de oro del design doc: si una regla del motor da rutina vacía para
// CUALQUIER perfil válido, es bug. Corre contra el catálogo real.
import { describe, it, expect } from 'vitest';
import { generarRutina, generarElongacion, necesitaOtraPersona, variantesDe, ejercicioDeVariante } from './motor';
import { alternativasDe } from './editor';
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

/**
 * Set en vez de `.some()`: son 720 perfiles × sus días × sus ejercicios contra
 * un catálogo de 1.400+. Con búsqueda lineal el test tardaba 5,4 s contra un
 * límite de 5 s — o sea, se ponía rojo por azar y frenaba el deploy.
 */
const IDS = new Set(CATALOGO.map((c) => c.id));

describe('catálogo real — rutina nunca vacía', () => {
  it('todos los perfiles válidos generan días con 3+ ejercicios reales', () => {
    // Se acumulan las fallas y se asserta una vez: así el mensaje dice QUÉ
    // perfil falló, en vez de cortar en el primero.
    const fallas: string[] = [];
    for (const edad of EDADES)
      for (const dias of DIAS)
        for (const nivel of NIVELES)
          for (const objetivo of OBJETIVOS)
            for (const equipamiento of EQUIPAMIENTOS) {
              const perfil = { edad, dias, nivel, objetivo, equipamiento };
              const quien = `${edad}a ${dias}d ${nivel}/${objetivo} [${equipamiento.join('+')}]`;
              const rutina = generarRutina(perfil, CATALOGO, 1);
              if (rutina.dias.length !== dias) {
                fallas.push(`${quien}: ${rutina.dias.length} días, se esperaban ${dias}`);
              }
              for (const dia of rutina.dias) {
                if (dia.ejercicios.length < 3) {
                  fallas.push(`${quien} · ${dia.nombre}: ${dia.ejercicios.length} ejercicios`);
                }
                for (const e of dia.ejercicios) {
                  if (!IDS.has(e.ejercicioId)) {
                    fallas.push(`${quien} · ${dia.nombre}: id inexistente ${e.ejercicioId}`);
                  }
                }
              }
            }
    expect(fallas).toEqual([]);
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

// Contra el catálogo real: acá es donde el bug existía de verdad. Con el
// catálogo de juguete de motor.test.ts todo pasaba igual.
describe('catálogo real — nunca se propone algo que necesita otra persona', () => {
  const ASISTIDOS = CATALOGO.filter((e) => e.equipment === 'assisted');

  it('los asistidos están marcados de las dos formas y son los que esperamos', () => {
    expect(ASISTIDOS.length).toBeGreaterThan(0);
    for (const e of ASISTIDOS) expect(e.elemento).toBe('ayuda o correa');
    // Y al revés: nadie lleva "ayuda o correa" sin estar marcado assisted.
    const porElemento = CATALOGO.filter((e) => e.elemento === 'ayuda o correa');
    expect(porElemento.map((e) => e.id).sort()).toEqual(ASISTIDOS.map((e) => e.id).sort());
  });

  it('ningún movimiento ofrece variantes asistidas', () => {
    const movimientos = [...new Set(ASISTIDOS.map((e) => e.movimiento))];
    const ofrecidos = movimientos.flatMap((m) => Object.values(variantesDe(CATALOGO, m)).flat());
    expect(ofrecidos.filter(necesitaOtraPersona)).toEqual([]);
  });

  // El caso exacto que reportó JFD: tocar "cuerpo" en la elongación de glúteos
  // del Día 4 devolvía 1709 "asistido", el primero del catálogo para ese
  // movimiento.
  it('el chip "cuerpo" de la elongación de glúteos no devuelve el asistido', () => {
    const variantes = variantesDe(CATALOGO, 'elongacion-gluteos');
    const elegido = ejercicioDeVariante(variantes.cuerpo, 'ST-Ankle_On_The_Knee');
    expect(elegido?.id).toBe('ST-Ankle_On_The_Knee');
    expect(variantes.cuerpo.map((e) => e.id)).not.toContain('1709');
  });

  it('alternativasDe tampoco los propone', () => {
    const gluteos = CATALOGO.find((e) => e.id === 'ST-Ankle_On_The_Knee')!;
    const alt = alternativasDe(CATALOGO, gluteos, ['pesas', 'maquina', 'pelota', 'rodillo', 'banda']);
    expect([...alt.equivalentes, ...alt.mismoMusculo].filter(necesitaOtraPersona)).toEqual([]);
  });
});
