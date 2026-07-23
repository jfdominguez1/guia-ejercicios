// @vitest-environment jsdom
// Feature: los flujos reales de la pantalla Historial, ejercitando el DOM.
// Estos tests existen porque los 183 tests de lógica pura no atrapan errores de
// wiring (un data-attribute mal escrito, un listener que no se conecta), que es
// justo la clase de bug que aparece recién en el teléfono.
import { describe, it, expect, beforeEach } from 'vitest';
import { montarHistorial } from './historial';
import { storage } from '../lib/storage';
import type { Ejercicio, Sesion } from '../lib/tipos';

const HOY = '2026-07-20';

const CATALOGO: Ejercicio[] = [
  {
    id: 'F1', nombre_es: 'Press banca', nombre_en: 'Bench press', tipo: 'fuerza', grupo: 'pesas',
    equipment: 'barra', zona: 'tren superior', musculo: 'pectorales', secundarios: [], pasos: [],
    movimiento: 'empuje-pectorales', basico: true,
  },
];

function sesionFuerza(extra: Partial<Sesion> = {}): Sesion {
  return {
    id: 's1',
    fecha: '2026-07-18',
    tipo: 'fuerza',
    estado: 'hecha',
    diaRutina: 'Día 1 — Empuje',
    items: [{ ejercicioId: 'F1', variante: 'pesas', series: [{ reps: 10, pesoKg: 20 }] }],
    ...extra,
  };
}

/** Arma el DOM que la página le da al módulo. */
function montar(respuestas: boolean[] = []) {
  document.body.innerHTML = `
    <div id="calendario"></div>
    <button id="btn-cardio">+ Registrar cardio</button>
    <div id="alta-cardio"></div>
    <div id="aviso-historial"></div>
    <div id="sesiones"></div>`;
  const preguntas: string[] = [];
  let i = 0;
  montarHistorial({
    raiz: document,
    catalogo: CATALOGO,
    hoy: () => HOY,
    confirmar: (mensaje) => {
      preguntas.push(mensaje);
      return respuestas[i++] ?? true;
    },
  });
  return { preguntas };
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const botonAccion = (accion: string) => $(`#sesiones [data-accion="${accion}"]`);

beforeEach(() => {
  localStorage.clear();
});

describe('listado', () => {
  it('muestra la sesión con su día y su detalle', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    const texto = $('#sesiones').textContent!;
    expect(texto).toContain('2026-07-18');
    expect(texto).toContain('Día 1 — Empuje');
    expect(texto).toContain('Press banca');
    expect(texto).toContain('1×10 · 20 kg · 44,1 lb');
  });

  it('sin sesiones muestra el mensaje vacío y no rompe', () => {
    montar();
    expect($('#sesiones').textContent).toContain('Todavía no hay sesiones');
  });

  it('muestra los salteados como salteados, no como una línea vacía', () => {
    storage.setSesiones([
      sesionFuerza({ items: [{ ejercicioId: 'F1', variante: 'pesas', series: [], salteado: true }] }),
    ]);
    montar();
    expect($('#sesiones').textContent).toContain('Press banca: salteado');
  });
});

describe('editar', () => {
  it('abre el formulario con los valores actuales', () => {
    storage.setSesiones([sesionFuerza({ rpe: 8 })]);
    montar();
    botonAccion('editar').click();
    expect(($('[data-campo="fecha"]') as HTMLInputElement).value).toBe('2026-07-18');
    expect(($('[data-campo="rpe"]') as HTMLInputElement).value).toBe('8');
    expect(($('[data-serie-campo="peso"]') as HTMLInputElement).value).toBe('20');
  });

  it('guarda el peso corregido en storage', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    ($('[data-serie-campo="peso"]') as HTMLInputElement).value = '25';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.series[0]!.pesoKg).toBe(25);
  });

  it('un valor inválido muestra el error y NO toca storage', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    ($('[data-campo="rpe"]') as HTMLInputElement).value = '99';
    botonAccion('guardar').click();
    expect($('[data-errores]').textContent).toContain('RPE');
    expect(storage.getSesiones()[0]!.rpe).toBeUndefined();
  });

  it('si se cancela la confirmación no se guarda nada', () => {
    storage.setSesiones([sesionFuerza()]);
    montar([false]);
    botonAccion('editar').click();
    ($('[data-campo="fecha"]') as HTMLInputElement).value = '2026-07-01';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.fecha).toBe('2026-07-18');
  });

  it('cancelar cierra el panel sin tocar el dato', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    botonAccion('editar').click();
    botonAccion('cancelar').click();
    expect($('[data-panel]')).toBeNull();
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('muestra la nota del ejercicio y la deja editar (mejora 8)', () => {
    const s = sesionFuerza();
    s.items![0]!.nota = 'hombro molestó';
    storage.setSesiones([s]);
    montar();
    expect($('#sesiones').textContent).toContain('hombro molestó');
    botonAccion('editar').click();
    const nota = $('[data-item-nota="0"]') as HTMLInputElement;
    expect(nota.value).toBe('hombro molestó');
    nota.value = 'ya no molesta';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.nota).toBe('ya no molesta');
  });

  it('borrar la nota la saca del item', () => {
    const s = sesionFuerza();
    s.items![0]!.nota = 'algo';
    storage.setSesiones([s]);
    montar();
    botonAccion('editar').click();
    ($('[data-item-nota="0"]') as HTMLInputElement).value = '';
    botonAccion('guardar').click();
    expect(storage.getSesiones()[0]!.items![0]!.nota).toBeUndefined();
  });
});

describe('borrar y deshacer', () => {
  it('pregunta una sola vez, mostrando qué se borra', () => {
    storage.setSesiones([sesionFuerza()]);
    const { preguntas } = montar([true]);
    botonAccion('borrar').click();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('¿Borrar esta sesión?');
    expect(preguntas[0]).toContain('Día 1 — Empuje');
    expect(storage.getSesiones()).toHaveLength(0);
  });

  it('cancelar no borra nada', () => {
    storage.setSesiones([sesionFuerza()]);
    montar([false]);
    botonAccion('borrar').click();
    expect(storage.getSesiones()).toHaveLength(1);
  });

  it('ofrece Deshacer y la restaura completa', () => {
    storage.setSesiones([sesionFuerza({ rpe: 8 })]);
    montar([true]);
    botonAccion('borrar').click();
    expect($('[data-deshacer]')).not.toBeNull();
    $('[data-deshacer]').click();
    const restaurada = storage.getSesiones();
    expect(restaurada).toHaveLength(1);
    expect(restaurada[0]).toMatchObject({ id: 's1', rpe: 8, fecha: '2026-07-18' });
    expect($('[data-deshacer]')).toBeNull();
  });

  it('la borrada queda en la papelera y sale al deshacer', () => {
    storage.setSesiones([sesionFuerza()]);
    montar([true]);
    botonAccion('borrar').click();
    expect(storage.getPapelera().map((s) => s.id)).toEqual(['s1']);
    $('[data-deshacer]').click();
    expect(storage.getPapelera()).toHaveLength(0);
  });

  it('al deshacer vuelve a su lugar por fecha, no al final', () => {
    storage.setSesiones([
      sesionFuerza({ id: 's1', fecha: '2026-07-10' }),
      sesionFuerza({ id: 's2', fecha: '2026-07-15' }),
      sesionFuerza({ id: 's3', fecha: '2026-07-19' }),
    ]);
    montar([true]);
    // Ordenado por fecha desc, el segundo "Borrar" es el de s2.
    $$('#sesiones [data-accion="borrar"]')[1]!.click();
    $('[data-deshacer]').click();
    expect(storage.getSesiones().map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('borra la sesión correcta cuando hay varias', () => {
    storage.setSesiones([
      sesionFuerza({ id: 's1', fecha: '2026-07-16' }),
      sesionFuerza({ id: 's2', fecha: '2026-07-18' }),
      sesionFuerza({ id: 's3', fecha: '2026-07-19' }),
    ]);
    montar([true]);
    $$('#sesiones [data-accion="borrar"]')[0]!.click();
    expect(storage.getSesiones().map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('nombre del ejercicio', () => {
  it('si el id ya no está en el catálogo usa el nombre guardado', () => {
    storage.setSesiones([
      sesionFuerza({
        items: [{ ejercicioId: 'BORRADO', nombre: 'Press viejo', variante: 'pesas', series: [{ reps: 10 }] }],
      }),
    ]);
    montar();
    expect($('#sesiones').textContent).toContain('Press viejo');
    expect($('#sesiones').textContent).not.toContain('BORRADO');
  });

  it('el catálogo gana sobre el nombre guardado (pudo renombrarse)', () => {
    storage.setSesiones([
      sesionFuerza({
        items: [{ ejercicioId: 'F1', nombre: 'Nombre viejo', variante: 'pesas', series: [{ reps: 10 }] }],
      }),
    ]);
    montar();
    expect($('#sesiones').textContent).toContain('Press banca');
  });
});

describe('alta de cardio', () => {
  it('registra la sesión con tipo, minutos y km', () => {
    montar();
    $('#btn-cardio').click();
    $('[data-tipo="bicicleta"]').click();
    ($('#cardio-min') as HTMLInputElement).value = '45';
    ($('#cardio-km') as HTMLInputElement).value = '15';
    ($('#cardio-fecha') as HTMLInputElement).value = HOY;
    $('#cardio-guardar').click();
    const guardada = storage.getSesiones()[0]!;
    expect(guardada.tipo).toBe('cardio');
    expect(guardada.cardio).toMatchObject({ tipo: 'bicicleta', minutos: 45, km: 15 });
    expect(guardada.id).toBeTruthy();
  });

  it('una fecha de hace más de 7 días se rechaza con mensaje', () => {
    montar();
    $('#btn-cardio').click();
    $('[data-tipo="cinta"]').click();
    ($('#cardio-fecha') as HTMLInputElement).value = '2026-06-01';
    $('#cardio-guardar').click();
    expect($('#cardio-error').textContent).toContain('últimos 7 días');
    expect(storage.getSesiones()).toHaveLength(0);
  });
});

describe('calendario', () => {
  it('un día con fuerza y cardio muestra los dos, no solo el primero', () => {
    storage.setSesiones([
      sesionFuerza({ id: 'a', fecha: '2026-07-18' }),
      { id: 'b', fecha: '2026-07-18', tipo: 'cardio', estado: 'hecha', cardio: { tipo: 'cinta', minutos: 20 } },
    ]);
    montar();
    const dia = [...document.querySelectorAll('#calendario .dia')].find((d) => d.textContent === '18')!;
    expect(dia.className).toContain('multi');
    expect(dia.getAttribute('style')).toContain('linear-gradient');
    expect(dia.getAttribute('title')).toBe('fuerza + cardio');
  });

  it('un día con un solo tipo mantiene su color plano', () => {
    storage.setSesiones([sesionFuerza({ fecha: '2026-07-18' })]);
    montar();
    const dia = [...document.querySelectorAll('#calendario .dia')].find((d) => d.textContent === '18')!;
    expect(dia.className).toContain('fuerza');
    expect(dia.className).not.toContain('multi');
  });
});

describe('filtros y paginación', () => {
  function muchas(n: number) {
    return Array.from({ length: n }, (_, i) =>
      sesionFuerza({ id: `s${i}`, fecha: `2026-07-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
  }

  it('muestra de a 20 y ofrece ver más', () => {
    storage.setSesiones(muchas(25));
    montar();
    expect($$('#sesiones details')).toHaveLength(20);
    expect($('[data-ver-mas]').textContent).toContain('Ver 5 más');
    $('[data-ver-mas]').click();
    expect($$('#sesiones details')).toHaveLength(25);
    expect($('[data-ver-mas]')).toBeNull();
  });

  it('filtra por tipo', () => {
    storage.setSesiones([
      sesionFuerza({ id: 'a' }),
      { id: 'b', fecha: '2026-07-19', tipo: 'cardio', estado: 'hecha', cardio: { tipo: 'cinta', minutos: 20 } },
    ]);
    montar();
    expect($$('#sesiones details')).toHaveLength(2);
    $('[data-filtro-tipo="cardio"]').click();
    expect($$('#sesiones details')).toHaveLength(1);
    expect($('#sesiones').textContent).toContain('Cardio');
  });

  it('filtra por mes', () => {
    storage.setSesiones([
      sesionFuerza({ id: 'a', fecha: '2026-07-18' }),
      sesionFuerza({ id: 'b', fecha: '2026-06-10' }),
    ]);
    montar();
    const select = $('[data-filtro-mes]') as HTMLSelectElement;
    select.value = '2026-06';
    select.dispatchEvent(new Event('change'));
    expect($$('#sesiones details')).toHaveLength(1);
    expect($('#sesiones').textContent).toContain('2026-06-10');
  });

  it('cambiar el filtro reinicia el "ver más"', () => {
    storage.setSesiones(muchas(25));
    montar();
    $('[data-ver-mas]').click();
    expect($$('#sesiones details')).toHaveLength(25);
    $('[data-filtro-tipo="fuerza"]').click();
    expect($$('#sesiones details')).toHaveLength(20);
  });

  it('un filtro sin resultados lo dice en vez de quedar en blanco', () => {
    storage.setSesiones([sesionFuerza()]);
    montar();
    $('[data-filtro-tipo="cardio"]').click();
    expect($('#sesiones').textContent).toContain('Nada con ese filtro');
  });

  it('sin ninguna sesión no muestra filtros, muestra el mensaje inicial', () => {
    montar();
    expect($('[data-filtro-tipo="todas"]')).toBeNull();
    expect($('#sesiones').textContent).toContain('Todavía no hay sesiones');
  });

  it('el conteo dice cuántas se ven de cuántas', () => {
    storage.setSesiones(muchas(25));
    montar();
    expect($('.conteo').textContent).toBe('20 de 25');
  });
});

describe('tipo de sesión visible y reparado', () => {
  const ESTIRAR: Ejercicio = {
    id: 'E1', nombre_es: 'Estiramiento de isquiotibiales', nombre_en: 'Hamstring stretch',
    tipo: 'elongacion', grupo: 'cuerpo', equipment: 'cuerpo', zona: 'tren inferior',
    musculo: 'isquiotibiales', secundarios: [], pasos: [], movimiento: 'estirar-isquios', basico: true,
  };

  function montarCon(catalogo: Ejercicio[]) {
    document.body.innerHTML = `
      <div id="calendario"></div>
      <button id="btn-cardio">+ Registrar cardio</button>
      <div id="alta-cardio"></div>
      <div id="aviso-historial"></div>
      <div id="sesiones"></div>`;
    montarHistorial({ raiz: document, catalogo, hoy: () => HOY, confirmar: () => true });
  }

  /** El caso real: sesión de elongación que el wizard viejo guardó como fuerza. */
  const elongacionMalGuardada: Sesion = {
    id: 'e1',
    fecha: '2026-07-18',
    tipo: 'fuerza',
    estado: 'hecha',
    diaRutina: 'Elongación (mañanas / días libres)',
    items: [
      { ejercicioId: 'E1', variante: 'cuerpo', series: [{ reps: 30, segundos: 30 }] },
      { ejercicioId: 'E1', variante: 'cuerpo', series: [{ reps: 40, segundos: 40 }] },
    ],
  };

  it('repara el tipo al abrir el historial, sin pasar por Hoy', () => {
    storage.setSesiones([elongacionMalGuardada]);
    montarCon([...CATALOGO, ESTIRAR]);
    expect(storage.getSesiones()[0]!.tipo).toBe('elongacion');
  });

  it('la sesión se pinta con el color de su tipo', () => {
    storage.setSesiones([elongacionMalGuardada]);
    montarCon([...CATALOGO, ESTIRAR]);
    const fila = document.querySelector('#sesiones details')!;
    expect(fila.className).toBe('tipo-elongacion');
    expect(fila.querySelector('summary')!.textContent).toContain('Elongación');
  });

  it('el día del calendario queda con la clase del tipo corregido', () => {
    storage.setSesiones([elongacionMalGuardada]);
    montarCon([...CATALOGO, ESTIRAR]);
    const dias = [...document.querySelectorAll('#calendario .dia')];
    expect(dias.some((d) => d.className.includes('elongacion'))).toBe(true);
    expect(dias.some((d) => d.className.includes('fuerza'))).toBe(false);
  });

  it('el filtro por elongación ahora la encuentra', () => {
    storage.setSesiones([elongacionMalGuardada]);
    montarCon([...CATALOGO, ESTIRAR]);
    (document.querySelector('[data-filtro-tipo="elongacion"]') as HTMLElement).click();
    expect(document.querySelectorAll('#sesiones details')).toHaveLength(1);
  });

  it('una sesión de fuerza sigue siendo de fuerza', () => {
    storage.setSesiones([sesionFuerza()]);
    montarCon([...CATALOGO, ESTIRAR]);
    expect(storage.getSesiones()[0]!.tipo).toBe('fuerza');
    expect(document.querySelector('#sesiones details')!.className).toBe('tipo-fuerza');
  });
});
