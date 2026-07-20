// Service worker de Guía de Ejercicios.
// Estrategia: app shell + catálogo precacheados; media cache-first (inmutable);
// resto stale-while-revalidate. El scope define BASE (subpath de GitHub Pages).

const VERSION = 'ge-v1';
const CACHE_SHELL = `${VERSION}-shell`;
const CACHE_MEDIA = `${VERSION}-media`;

const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');

const SHELL = [
  `${BASE}/`,
  `${BASE}/rutina/`,
  `${BASE}/perfil/`,
  `${BASE}/catalogo/`,
  `${BASE}/historial/`,
  `${BASE}/entrenar/`,
  `${BASE}/ejercicio/`,
  `${BASE}/data/ejercicios.json`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
];

// Sin skipWaiting(): la versión nueva espera a que el usuario acepte actualizar.
// Si se activara sola, la pestaña abierta seguiría corriendo el JS viejo y la
// app quedaría en un estado mezclado (era el "cerrá y abrí" de cada deploy).
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL)));
});

// La página avisa cuando el usuario tocó "Actualizar".
self.addEventListener('message', (evento) => {
  if (evento.data === 'activar-ya') self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(pedido, nombreCache) {
  const cacheado = await caches.match(pedido);
  if (cacheado) return cacheado;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) {
    const cache = await caches.open(nombreCache);
    cache.put(pedido, respuesta.clone());
  }
  return respuesta;
}

async function staleWhileRevalidate(pedido) {
  const cache = await caches.open(CACHE_SHELL);
  const cacheado = await cache.match(pedido, { ignoreSearch: pedido.url.includes('/ejercicio/') });
  const red = fetch(pedido)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(pedido, respuesta.clone());
      return respuesta;
    })
    .catch(() => cacheado);
  return cacheado ?? red;
}

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/media/')) {
    evento.respondWith(cacheFirst(evento.request, CACHE_MEDIA));
  } else {
    evento.respondWith(staleWhileRevalidate(evento.request));
  }
});

// "Descargar todo": la página manda la lista de URLs de media a precachear.
self.addEventListener('message', async (evento) => {
  const datos = evento.data;
  if (!datos || datos.tipo !== 'descargar-media' || !Array.isArray(datos.urls)) return;
  const cache = await caches.open(CACHE_MEDIA);
  let hechas = 0;
  const LOTE = 6;
  for (let i = 0; i < datos.urls.length; i += LOTE) {
    await Promise.all(
      datos.urls.slice(i, i + LOTE).map(async (u) => {
        try {
          if (!(await cache.match(u))) {
            const r = await fetch(u);
            if (r.ok) await cache.put(u, r);
          }
        } catch {
          // sin red o archivo faltante: se reintenta en otra corrida
        }
        hechas += 1;
      }),
    );
    const clientes = await self.clients.matchAll();
    for (const c of clientes) c.postMessage({ tipo: 'progreso-media', hechas, total: datos.urls.length });
  }
});
