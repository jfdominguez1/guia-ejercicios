// Tests del service worker (public/sw.js). Se evalúa el archivo real dentro de
// un `self` de mentira con Cache API y fetch falsos: es la única capa donde vive
// la decisión de "qué se sirve", y ya nos costó una pantalla clavada en
// "Cargando…" durante un día entero.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const ORIGEN = 'https://jfdominguez1.github.io';
const BASE = `${ORIGEN}/guia-ejercicios`;

type RespuestaFalsa = { ok: boolean; cuerpo: string; clone: () => RespuestaFalsa };
const respuesta = (cuerpo: string, ok = true): RespuestaFalsa => {
  const r: RespuestaFalsa = { ok, cuerpo, clone: () => r };
  return r;
};

const clave = (pedido: unknown): string =>
  new URL(typeof pedido === 'string' ? pedido : (pedido as { url: string }).url, `${BASE}/`).href;

class CacheFalso {
  mapa = new Map<string, RespuestaFalsa>();
  async match(pedido: unknown, opciones?: { ignoreSearch?: boolean }) {
    const buscada = clave(pedido);
    if (!opciones?.ignoreSearch) return this.mapa.get(buscada);
    // Como la spec: devuelve la PRIMERA guardada que coincida ignorando el query
    // (orden de inserción). Justamente por eso ganaba siempre la del install.
    const sinQuery = (u: string) => u.split('?')[0];
    for (const [guardada, resp] of this.mapa) {
      if (sinQuery(guardada) === sinQuery(buscada)) return resp;
    }
    return undefined;
  }
  async put(pedido: unknown, resp: RespuestaFalsa) {
    this.mapa.set(clave(pedido), resp);
  }
  async addAll(urls: string[]) {
    for (const u of urls) this.mapa.set(clave(u), respuesta(`precache viejo de ${u}`));
  }
}

class CachesFalso {
  caches = new Map<string, CacheFalso>();
  async open(nombre: string) {
    if (!this.caches.has(nombre)) this.caches.set(nombre, new CacheFalso());
    return this.caches.get(nombre)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(nombre: string) {
    return this.caches.delete(nombre);
  }
  /** El match global de la spec: busca en TODOS los caches. */
  async match(pedido: unknown) {
    for (const c of this.caches.values()) {
      const hit = await c.match(pedido);
      if (hit) return hit;
    }
    return undefined;
  }
}

interface Sw {
  handlers: Record<string, (evento: any) => void>;
  caches: CachesFalso;
  fetch: ReturnType<typeof vi.fn>;
}

/** Carga public/sw.js en un entorno falso y devuelve sus handlers. */
function cargarSw(red: (pedido: any) => Promise<RespuestaFalsa>): Sw {
  const handlers: Record<string, (evento: any) => void> = {};
  const cachesFalso = new CachesFalso();
  const fetchFalso = vi.fn((pedido: any) => red(pedido));
  const self = {
    registration: { scope: `${BASE}/` },
    location: { origin: ORIGEN },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting: () => {},
    addEventListener: (nombre: string, fn: (evento: any) => void) => {
      handlers[nombre] = fn;
    },
  };
  const codigo = readFileSync('public/sw.js', 'utf8');
  new Function('self', 'caches', 'fetch', codigo)(self, cachesFalso, fetchFalso);
  return { handlers, caches: cachesFalso, fetch: fetchFalso };
}

function pedirDocumento(sw: Sw, url: string): Promise<RespuestaFalsa> {
  let devuelto: Promise<RespuestaFalsa> | undefined;
  sw.handlers.fetch!({
    request: { url, method: 'GET', mode: 'navigate' },
    respondWith: (p: Promise<RespuestaFalsa>) => {
      devuelto = p;
    },
    waitUntil: () => {},
  });
  return devuelto!;
}

function pedirRecurso(sw: Sw, url: string): Promise<RespuestaFalsa> {
  let devuelto: Promise<RespuestaFalsa> | undefined;
  sw.handlers.fetch!({
    request: { url, method: 'GET', mode: 'no-cors' },
    respondWith: (p: Promise<RespuestaFalsa>) => {
      devuelto = p;
    },
    waitUntil: () => {},
  });
  return devuelto!;
}

/** Instala el SW (precachea el shell con contenido "viejo"). */
async function instalar(sw: Sw) {
  let tarea: Promise<unknown> | undefined;
  sw.handlers.install!({ waitUntil: (p: Promise<unknown>) => { tarea = p; } });
  await tarea;
}

describe('service worker — la ficha de ejercicio', () => {
  it('sirve el HTML de la red aunque haya una copia vieja precacheada', async () => {
    // El bug del 03/08: `/ejercicio/` quedaba clavado en la copia del install y
    // esa copia pedía un bundle que el deploy siguiente ya no publica.
    const sw = cargarSw(async () => respuesta('html nuevo'));
    await instalar(sw);

    const r = await pedirDocumento(sw, `${BASE}/ejercicio/?id=0798`);

    expect(r.cuerpo).toBe('html nuevo');
  });

  it('guarda una sola entrada por ruta, no una por ejercicio', async () => {
    const sw = cargarSw(async () => respuesta('html nuevo'));
    await instalar(sw);

    await pedirDocumento(sw, `${BASE}/ejercicio/?id=0798`);
    await pedirDocumento(sw, `${BASE}/ejercicio/?id=1259`);

    const shell = [...sw.caches.caches.entries()].find(([n]) => n.endsWith('-shell'))![1];
    const fichas = [...shell.mapa.keys()].filter((k) => k.includes('/ejercicio/'));
    expect(fichas).toEqual([`${BASE}/ejercicio/`]);
  });

  it('sin señal sirve la última copia buena', async () => {
    const sw = cargarSw(async () => {
      throw new Error('sin red');
    });
    await instalar(sw);

    const r = await pedirDocumento(sw, `${BASE}/ejercicio/?id=0798`);

    expect(r.cuerpo).toContain('precache viejo');
  });

  it('si la red no contesta en el margen, no deja la pantalla en blanco', async () => {
    vi.useFakeTimers();
    try {
      const sw = cargarSw(() => new Promise<RespuestaFalsa>(() => {})); // nunca resuelve
      await instalar(sw);

      const promesa = pedirDocumento(sw, `${BASE}/ejercicio/?id=0798`);
      await vi.advanceTimersByTimeAsync(3000);

      expect((await promesa).cuerpo).toContain('precache viejo');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('service worker — la media descargada por el usuario', () => {
  it('se sirve del cache aunque haya quedado en uno de una versión vieja', async () => {
    // "Descargar todas las demostraciones" son ~2700 archivos bajados a mano:
    // no puede depender de en qué versión del SW se bajaron.
    const sw = cargarSw(async () => respuesta('gif de la red'));
    const viejo = await sw.caches.open('ge-v1-media');
    await viejo.put(`${BASE}/media/gif/0798.gif`, respuesta('gif ya bajado'));

    const r = await pedirRecurso(sw, `${BASE}/media/gif/0798.gif`);

    expect(r.cuerpo).toBe('gif ya bajado');
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it('el activate limpia los shell viejos y NO toca la media', async () => {
    const sw = cargarSw(async () => respuesta('x'));
    await sw.caches.open('ge-viejo-shell');
    await sw.caches.open('ge-v1-media');
    await sw.caches.open('ge-media');
    await instalar(sw);

    let tarea: Promise<unknown> | undefined;
    sw.handlers.activate!({ waitUntil: (p: Promise<unknown>) => { tarea = p; } });
    await tarea;

    const quedan = await sw.caches.keys();
    expect(quedan).toContain('ge-media');
    expect(quedan).toContain('ge-v1-media');
    expect(quedan).not.toContain('ge-viejo-shell');
  });
});
