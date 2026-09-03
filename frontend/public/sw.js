// Service worker de OpenStore — mínimo y honesto sobre lo que hace:
// permite instalar la app (PWA) y sirve el cascarón de la interfaz cuando
// no hay red, pero las búsquedas siguen necesitando conexión (dependen de
// la API de GitHub y de un modelo de IA en la nube; no hay forma de
// "cachear" eso de forma útil).
//
// Sube la versión del cache cada vez que cambie esta lista de assets
// estáticos, para invalidar cachés viejas de usuarios que ya instalaron.
const CACHE_VERSION = "openstore-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Nunca interceptamos llamadas a la API (backend en Render): siempre
  // deben ir a la red, en vivo — cachear una búsqueda no tiene sentido.
  if (url.pathname.startsWith("/api/")) return;
  // Solo mismo origen: no interferimos con GitHub, Unsplash, fuentes, etc.
  if (url.origin !== self.location.origin) return;

  // Navegación (recargar la página / abrir la PWA): red primero, con el
  // cascarón cacheado como red de seguridad si no hay conexión.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/", clone));
          return resp;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Assets estáticos (JS/CSS con hash, imágenes, iconos): cache primero,
  // y de paso actualizamos la caché en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
