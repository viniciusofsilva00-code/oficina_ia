/* oficina_ia · desenho isométrico em SVG de caixas [x, y, z, largura, altura, profundidade].
   Vista de cima, da frente e da direita. A ordem de desenho sai do eixo que separa cada par de caixas. */
(function () {
  "use strict";
  var C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  var GRUPO_CORES = ["#d9a36a", "#86b07a", "#5f9c95", "#b4869a", "#e8c35a", "#8f7fb0", "#c99790", "#a8825f", "#7fa7c9", "#c9b37f"];

  function proj(x, y, z) { return [(x - z) * C30, (x + z) * S30 - y]; }

  function tom(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var m = function (c) { return Math.max(0, Math.min(255, Math.round(f >= 1 ? c + (255 - c) * (f - 1) : c * f))); };
    return "#" + ((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1);
  }

  function limites(c) { return { min: [c[0], c[1], c[2]], max: [c[0] + c[3], c[1] + c[4], c[2] + c[5]] }; }

  function caixa2d(b) {
    var l = limites(b.caixa), xs = [], ys = [];
    for (var i = 0; i < 8; i++) {
      var p = proj(i & 1 ? l.max[0] : l.min[0], i & 2 ? l.max[1] : l.min[1], i & 4 ? l.max[2] : l.min[2]);
      xs.push(p[0]); ys.push(p[1]);
    }
    return { x0: Math.min.apply(0, xs), x1: Math.max.apply(0, xs), y0: Math.min.apply(0, ys), y1: Math.max.apply(0, ys) };
  }

  /* a atrás de b? +1 sim, -1 não, 0 indiferente */
  function atras(a, b) {
    var A = limites(a.caixa), B = limites(b.caixa), melhor = 0, sep = -1e9;
    for (var k = 0; k < 3; k++) {
      var g1 = B.min[k] - A.max[k], g2 = A.min[k] - B.max[k];
      if (g1 > -0.01 && g1 > sep) { sep = g1; melhor = 1; }
      if (g2 > -0.01 && g2 > sep) { sep = g2; melhor = -1; }
    }
    return melhor;
  }

  function ordenar(boxes) {
    var n = boxes.length, r2 = boxes.map(caixa2d), arestas = boxes.map(function () { return []; }), grau = new Array(n).fill(0);
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var a = r2[i], b = r2[j];
      if (a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0) continue;
      var t = atras(boxes[i], boxes[j]);
      if (t > 0) { arestas[i].push(j); grau[j]++; } else if (t < 0) { arestas[j].push(i); grau[i]++; }
    }
    var fila = [], out = [], feito = new Array(n).fill(false);
    var prof = function (i) { var c = boxes[i].caixa; return c[0] + c[3] / 2 + c[1] + c[4] / 2 + c[2] + c[5] / 2; };
    for (i = 0; i < n; i++) if (!grau[i]) fila.push(i);
    while (out.length < n) {
      if (!fila.length) { /* ciclo: solta o mais distante */
        var resto = []; for (i = 0; i < n; i++) if (!feito[i]) resto.push(i);
        resto.sort(function (p, q) { return prof(p) - prof(q); }); fila.push(resto[0]); grau[resto[0]] = 0;
      }
      fila.sort(function (p, q) { return prof(p) - prof(q); });
      var v = fila.shift(); if (feito[v]) continue;
      feito[v] = true; out.push(boxes[v]);
      arestas[v].forEach(function (w) { if (--grau[w] === 0 && !feito[w]) fila.push(w); });
    }
    return out;
  }

  function pts(arr) { return arr.map(function (p) { var q = proj(p[0], p[1], p[2]); return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" "); }

  /* boxes: [{caixa, cor, rotulo?, fantasma?, destaque?}] */
  function svg(boxes, opt) {
    opt = opt || {};
    if (!boxes.length) return '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg>';
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    boxes.forEach(function (b) { var r = caixa2d(b); x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1); y0 = Math.min(y0, r.y0); y1 = Math.max(y1, r.y1); });
    var pad = opt.pad == null ? 6 : opt.pad, partes = [], rotulos = [], postos = [];
    ordenar(boxes).forEach(function (b) {
      var l = limites(b.caixa), a = l.min, z = l.max;
      var base = b.fantasma ? "#c9c9cf" : (b.destaque ? "#ff2bd6" : b.cor || "#d9a36a");
      var op = b.fantasma ? 0.35 : 1;
      var faces = [
        [[a[0], z[1], a[2]], [z[0], z[1], a[2]], [z[0], z[1], z[2]], [a[0], z[1], z[2]], 1.18],
        [[a[0], a[1], z[2]], [z[0], a[1], z[2]], [z[0], z[1], z[2]], [a[0], z[1], z[2]], 1.0],
        [[z[0], a[1], a[2]], [z[0], a[1], z[2]], [z[0], z[1], z[2]], [z[0], z[1], a[2]], 0.78]
      ];
      partes.push('<g opacity="' + op + '">' + faces.map(function (f) {
        return '<polygon class="iso-face" points="' + pts(f.slice(0, 4)) + '" fill="' + tom(base, f[4]) + '"/>';
      }).join("") + "</g>");
      if (b.rotulo) {
        var c = proj(a[0] + (z[0] - a[0]) / 2, a[1] + (z[1] - a[1]) / 2, z[2]);
        /* afasta rótulos que cairiam um sobre o outro */
        for (var t = 0; t < 8 && postos.some(function (q) { return Math.abs(q[0] - c[0]) < 22 && Math.abs(q[1] - c[1]) < 11; }); t++) c[1] += 11;
        postos.push(c);
        rotulos.push('<text class="iso-lbl" x="' + c[0].toFixed(1) + '" y="' + (c[1] + 3).toFixed(1) + '" text-anchor="middle">' + b.rotulo + "</text>");
      }
    });
    var w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (x0 - pad).toFixed(1) + " " + (y0 - pad).toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1) +
      '" role="img" aria-label="' + (opt.titulo || "desenho isométrico") + '">' + partes.join("") + rotulos.join("") + "</svg>";
  }

  function coresGrupo(nomes) {
    var m = {}; nomes.forEach(function (g) { if (!(g in m)) m[g] = GRUPO_CORES[Object.keys(m).length % GRUPO_CORES.length]; }); return m;
  }

  window.OficinaIso = { svg: svg, coresGrupo: coresGrupo, tom: tom };
})();
