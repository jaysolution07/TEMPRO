#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
//  TEMPRO — Préparation du dossier à héberger
//
//  Usage :  node preparer.js        (depuis le dossier pwa/)
//
//  Ce script fait deux choses, et rien d'autre :
//    1. il copie TEMPRO.html ici sous le nom index.html — copie EXACTE,
//       octet pour octet : le fichier de référence reste TEMPRO.html ;
//    2. il régénère les icônes PNG de l'application (flocon blanc sur
//       fond teal, comme le favicon) aux tailles attendues.
//
//  Aucune dépendance : les images sont dessinées puis encodées en PNG
//  directement par ce fichier.
// ════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICI = __dirname;
const SOURCE_HTML = path.join(ICI, '..', 'TEMPRO.html');
const TEAL = [0x0F, 0x5E, 0x6B];
const BLANC = [255, 255, 255];

// ── Encodage PNG minimal (RGBA 8 bits, sans filtre) ─────────────────
const TABLE_CRC = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function morceau(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length, 0);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([longueur, corps, crc]);
}

function encoderPng(rgba, taille) {
  const ligne = taille * 4 + 1;
  const brut = Buffer.alloc(ligne * taille);
  for (let y = 0; y < taille; y++) {
    brut[y * ligne] = 0; // filtre « none »
    rgba.copy(brut, y * ligne + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlib.deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0))
  ]);
}

// ── Géométrie de l'icône ────────────────────────────────────────────
// Les trois barres reprennent exactement celles du favicon de
// l'application (viewBox 64 × 64), légèrement réduites pour rester dans
// la zone de sécurité des icônes adaptatives.
const BARRES = [
  [0.5, 0.140625, 0.5, 0.859375],
  [0.1875, 0.3125, 0.8125, 0.6875],
  [0.1875, 0.6875, 0.8125, 0.3125]
];

function distanceSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function dansArrondi(x, y, taille, rayon) {
  const dx = Math.min(x, taille - x);
  const dy = Math.min(y, taille - y);
  if (dx >= rayon || dy >= rayon) return true;
  const ex = rayon - dx, ey = rayon - dy;
  return Math.sqrt(ex * ex + ey * ey) <= rayon;
}

function rendreIcone(taille, options) {
  const opts = options || {};
  const plein = !!opts.plein;            // fond jusqu'aux bords (icône adaptative)
  const rayon = (opts.coin === undefined ? 0.22 : opts.coin) * taille;
  const echelle = opts.echelle === undefined ? 0.94 : opts.echelle;
  const demiEpaisseur = 0.02734375 * taille * echelle;
  const cx = taille / 2, cy = taille / 2;

  const segments = BARRES.map(function (b) {
    return {
      ax: cx + (b[0] * taille - cx) * echelle,
      ay: cy + (b[1] * taille - cy) * echelle,
      bx: cx + (b[2] * taille - cx) * echelle,
      by: cy + (b[3] * taille - cy) * echelle
    };
  });

  const SUR = 4;                       // 4 × 4 sous-points par pixel
  const SOUS = SUR * SUR;
  const image = Buffer.alloc(taille * taille * 4);

  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let alpha = 0, r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SUR; sy++) {
        for (let sx = 0; sx < SUR; sx++) {
          const px = x + (sx + 0.5) / SUR;
          const py = y + (sy + 0.5) / SUR;
          let flocon = false;
          for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            if (distanceSegment(px, py, s.ax, s.ay, s.bx, s.by) <= demiEpaisseur) { flocon = true; break; }
          }
          const fond = plein || dansArrondi(px, py, taille, rayon);
          if (!flocon && !fond) continue;         // transparent
          const c = flocon ? BLANC : TEAL;
          alpha += 255;
          r += c[0] * 255; g += c[1] * 255; b += c[2] * 255;
        }
      }
      const i = (y * taille + x) * 4;
      if (alpha > 0) {
        image[i] = Math.round(r / alpha);
        image[i + 1] = Math.round(g / alpha);
        image[i + 2] = Math.round(b / alpha);
        image[i + 3] = Math.round(alpha / SOUS);
      }
    }
  }
  return image;
}

// ── Exécution ───────────────────────────────────────────────────────
function main() {
  const html = fs.readFileSync(SOURCE_HTML);
  fs.writeFileSync(path.join(ICI, 'index.html'), html);

  const icones = [
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-512-maskable.png', 512, { plein: true }],
    ['apple-touch-icon.png', 180, { plein: true }]
  ];
  icones.forEach(function (def) {
    const png = encoderPng(rendreIcone(def[1], def[2]), def[1]);
    fs.writeFileSync(path.join(ICI, def[0]), png);
  });

  const attendus = ['manifest.webmanifest', 'sw.js'];
  attendus.forEach(function (f) {
    if (!fs.existsSync(path.join(ICI, f))) throw new Error('Fichier manquant : ' + f);
  });

  console.log('✅ index.html écrit (' + html.length + ' octets) — copie exacte de TEMPRO.html');
  icones.forEach(function (def) {
    const st = fs.statSync(path.join(ICI, def[0]));
    console.log('✅ ' + def[0] + ' — ' + def[1] + '×' + def[1] + ' (' + st.size + ' octets)');
  });
  console.log('✅ Dossier prêt à héberger : ' + ICI);
}

main();
