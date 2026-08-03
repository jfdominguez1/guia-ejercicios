// Service worker de Guía de Ejercicios.
// Estrategia: navegaciones red-primero con margen corto (offline sirve la copia),
// media cache-first (inmutable) y el resto stale-while-revalidate.
// El scope define BASE (subpath de GitHub Pages).

// La sella el build (scripts/sellar-sw.mjs) con la huella de dist: cada deploy
// cambia los bytes de ESTE archivo, que es lo único que dispara un install nuevo.
// Con la versión clavada a mano, el precache quedaba congelado para siempre.
const VERSION = 'ge-dev';
const CACHE_SHELL = `${VERSION}-shell`;
// Sin versión a propósito: los GIF no cambian nunca y bajarlos es un acto
// deliberado del usuario ("Descargar todas las demostraciones", ~2700 archivos).
// Versionarlo haría que cada deploy le borrara la descarga sin avisar.
const CACHE_MEDIA = 'ge-media';

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

// Se limpian los shell de versiones viejas. La media NO se toca: es la descarga
// del usuario y sigue sirviendo aunque haya quedado en un cache versionado viejo
// (cacheFirst busca en todos los caches).
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.filter((k) => k.endsWith('-shell') && k !== CACHE_SHELL).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Clave de cache de una página: la ruta SIN query. `/ejercicio/?id=A` y
 * `/ejercicio/?id=B` son el mismo documento; guardar una entrada por id llenaba
 * el cache y, peor, el match con `ignoreSearch` devolvía siempre la primera
 * guardada — la del install. Así la ficha quedó clavada en la versión de julio
 * apuntando a un bundle que el deploy siguiente ya no publica: 404, el script
 * nunca arranca y la pantalla se queda en "Cargando…" para siempre (03/08).
 */
function claveDocumento(url) {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

// Margen que se le da a la red antes de servir la copia local. En el gimnasio la
// señal es mala: esperar la red sin límite es una pantalla en blanco.
const MARGEN_RED_MS = 2500;

/**
 * Documentos: red primero (así el HTML y sus bundles hasheados van siempre
 * juntos), con la copia local como red de contención por timeout o sin señal.
 */
async function documento(pedido, evento) {
  const clave = claveDocumento(pedido.url);
  const cache = await caches.open(CACHE_SHELL);
  const red = fetch(pedido).then((respuesta) => {
    if (respuesta.ok) cache.put(clave, respuesta.clone());
    return respuesta;
  });
  evento.waitUntil(red.catch(() => {}));

  const cacheado = await cache.match(clave);
  if (!cacheado) return red;

  const espera = new Promise((resolver) => setTimeout(() => resolver(null), MARGEN_RED_MS));
  const ganador = await Promise.race([red.catch(() => null), espera]);
  return ganador ?? cacheado;
}

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
  const cacheado = await cache.match(pedido);
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
  if (evento.request.mode === 'navigate') {
    evento.respondWith(documento(evento.request, evento));
  } else if (url.pathname.includes('/media/')) {
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
