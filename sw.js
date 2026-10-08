// ════════════════════════════════════════════════════════════════════
//  TEMPRO — Ouverture hors ligne
//
//  Ce fichier est ce qui permet au navigateur de proposer l'installation
//  en un clic. Il reste volontairement très prudent :
//    • tous les fichiers sont demandés au réseau d'abord (aucune version
//      périmée ne peut s'afficher, même après une mise à jour) ;
//    • seuls les fichiers de ce dossier sont mis en cache ;
//    • les échanges avec le service de données ne sont JAMAIS interceptés
//      ni conservés — les relevés passent toujours par le réseau.
// ════════════════════════════════════════════════════════════════════
'use strict';

const CACHE = 'tempro-v2';
const FICHIERS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await Promise.all(FICHIERS.map(function (f) {
      // Un fichier manquant ne doit pas empêcher l'installation.
      return cache.add(new Request(f, { cache: 'reload' })).catch(function () {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const cles = await caches.keys();
    await Promise.all(cles.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  let url;
  try { url = new URL(requete.url); } catch (e) { return; }
  // Tout ce qui n'appartient pas à ce dossier (service de connexion,
  // service de données) n'est ni touché, ni mis en cache.
  if (url.origin !== self.location.origin) return;

  // Réseau d'abord, TOUJOURS : une version mise à jour s'affiche dès le
  // premier chargement, jamais une copie périmée. Le cache ne sert qu'en
  // secours si le réseau ne répond pas.
  event.respondWith((async function () {
    try {
      const reponse = await fetch(requete);
      if (reponse && reponse.ok && reponse.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(requete, reponse.clone()).catch(function () {});
      }
      return reponse;
    } catch (e) {
      const secours = await caches.match(requete);
      if (secours) return secours;
      if (requete.mode === 'navigate') {
        const page = await caches.match('./index.html');
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
