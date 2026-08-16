// Feature: "Reportar un problema" — el lugar propio para avisar que la APP
// anda mal. Tres reportes reales viajaron por campos que no eran para eso
// (sensación 09/08, nota de sesión 12/08, observación de ejercicio 16/08):
// llegaban sin fecha exacta, sin versión y pegados a un ejercicio equivocado.
import { describe, it, expect } from 'vitest';
import { armarReporte, contextoDeDraft, fechaHoraLocal, versionDeSw } from './reporte';

describe('armarReporte', () => {
  const CONTEXTO = { fecha: '2026-08-16 19:42', pantalla: '/entrenar/' };

  it('junta texto y contexto, sin campos vacíos de relleno', () => {
    const r = armarReporte('  los gráficos se ven congelados  ', CONTEXTO);
    expect(r).toEqual({
      fecha: '2026-08-16 19:42',
      pantalla: '/entrenar/',
      texto: 'los gráficos se ven congelados',
    });
    expect(r).not.toHaveProperty('version');
    expect(r).not.toHaveProperty('sesionActiva');
  });

  it('conserva versión y sesión activa cuando están', () => {
    const r = armarReporte('x', { ...CONTEXTO, version: 'ge-abc123', sesionActiva: 'Fuerza A · ejercicio 3/8 (0739)' });
    expect(r?.version).toBe('ge-abc123');
    expect(r?.sesionActiva).toBe('Fuerza A · ejercicio 3/8 (0739)');
  });

  it('sin texto no hay reporte (vacío o puro espacio)', () => {
    expect(armarReporte('', CONTEXTO)).toBeNull();
    expect(armarReporte('   \n ', CONTEXTO)).toBeNull();
  });
});

describe('contextoDeDraft', () => {
  const DRAFT = {
    fecha: '2026-08-16',
    nombreDia: 'Fuerza A',
    indice: 2,
    ejercicios: [{ ejercicioId: '0577' }, { ejercicioId: '0861' }, { ejercicioId: '0739' }],
  };

  it('describe día, posición y ejercicio en curso', () => {
    expect(contextoDeDraft(DRAFT)).toBe('Fuerza A · ejercicio 3/3 (0739)');
  });

  // Un reporte nunca puede fallar por culpa del contexto: cualquier draft
  // inesperado (viejo, corrupto, de otra versión) se ignora y el texto viaja igual.
  it('cualquier forma inesperada devuelve undefined en vez de romper', () => {
    expect(contextoDeDraft(null)).toBeUndefined();
    expect(contextoDeDraft('basura')).toBeUndefined();
    expect(contextoDeDraft({})).toBeUndefined();
    expect(contextoDeDraft({ nombreDia: 'X', ejercicios: 'no-array' })).toBeUndefined();
  });

  it('sesión sin ejercicios todavía: alcanza con el nombre del día', () => {
    expect(contextoDeDraft({ nombreDia: 'Sesión libre', indice: 0, ejercicios: [] })).toBe('Sesión libre');
  });
});

describe('versionDeSw', () => {
  it('saca el sello ge-… del sw.js sellado', () => {
    expect(versionDeSw("const CACHE_MEDIA = 'ge-media';\nconst VERSION = 'ge-a7f4e63b51';")).toBe('ge-a7f4e63b51');
  });

  it('sw.js sin sellar (dev) → sin versión, sin inventar', () => {
    expect(versionDeSw("const VERSION = 'dev';")).toBeUndefined();
    expect(versionDeSw('')).toBeUndefined();
  });
});

describe('fechaHoraLocal', () => {
  // Hora LOCAL a propósito: a las 22:00 de Argentina, toISOString ya es "mañana".
  it('formatea fecha y hora locales con ceros a la izquierda', () => {
    expect(fechaHoraLocal(new Date(2026, 7, 16, 9, 5))).toBe('2026-08-16 09:05');
  });
});
