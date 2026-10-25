/* oficina_ia · monta a página do projeto a partir de projeto.json + calculado.json */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); };
  var num = function (v) { return typeof v === "number" ? String(v).replace(".", ",") : esc(v); };
  var Iso = window.OficinaIso;

  function getJSON(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }

  /* texto simples: parágrafos por linha em branco, "- " vira lista */
  function txt(s) {
    return String(s || "").split(/\n\s*\n/).map(function (bloco) {
      var linhas = bloco.split("\n");
      if (linhas.every(function (l) { return /^\s*- /.test(l); })) return "<ul>" + linhas.map(function (l) { return "<li>" + esc(l.replace(/^\s*- /, "")) + "</li>"; }).join("") + "</ul>";
      return "<p>" + esc(bloco).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  function guardado(chave) { try { return JSON.parse(localStorage.getItem(chave) || "{}"); } catch (e) { return {}; } }
  function guardar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue */ } }

  function medidasPeca(c) {
    var d = [c[3], c[4], c[5]].slice().sort(function (a, b) { return b - a; });
    return f1(d[0]) + " × " + f1(d[1]) + " cm · " + Math.round(d[2] * 10) + " mm";
  }

  Promise.all([getJSON("projeto.json"), getJSON("calculado.json").catch(function () { return null; })])
    .then(function (r) { render(r[0], r[1]); })
    .catch(function (e) { app.innerHTML = '<p class="lead">Não consegui abrir este projeto (' + esc(e.message) + ").</p>"; });

  function render(P, C) {
    document.title = P.titulo + " · oficina_ia";
    var pecas = P.pecas || [], passos = P.passos || [];
    var cores = Iso.coresGrupo(pecas.map(function (p) { return p.grupo || "peças"; }));
    var corDe = function (p) { return cores[p.grupo || "peças"]; };
    var porId = {}; pecas.forEach(function (p) { porId[p.id] = p; });
    var passoDe = {}; passos.forEach(function (s, i) { (s.pecas || []).forEach(function (id) { passoDe[id] = i; }); });
    var chaveChk = "oficina-" + P.id;
    var medidas = (C && C.medidas_reais) || P.dimensoes_externas || {};
    var n = P.id ? P.id.split("-")[0] : "";

    /* ---------- selo ---------- */
    var selo, naoCorte = "";
    if (!C) selo = '<div class="seal none"><span class="ico">não validado</span><div>Este projeto ainda não passou pelo validador. Não corte nada.</div></div>';
    else if (C.status === "ok") selo = '<div class="seal ok"><span class="ico">medidas conferidas</span><div><strong>' + C.verificacoes.length + " verificações passaram.</strong> O validador somou as peças, conferiu folgas, contas, passos e chapas." +
      "<details><summary>ver as verificações</summary><ul>" + C.verificacoes.map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") + "</ul></details>" +
      (C.avisos.length ? "<details><summary>" + C.avisos.length + " aviso(s)</summary><ul>" + C.avisos.map(function (a) { return "<li>" + esc(a.msg) + "</li>"; }).join("") + "</ul></details>" : "") + "</div></div>";
    else {
      selo = '<div class="seal bad"><span class="ico">erro nas medidas</span><div><strong>' + C.erros.length + " problema(s) encontrados.</strong> Não corte nenhuma chapa.</div></div>";
      naoCorte = '<div class="naocorte"><h3>Não corte: o projeto não fechou</h3><ul>' + C.erros.map(function (e) { return "<li>" + esc(e.msg) + "</li>"; }).join("") +
        '</ul><p class="note">Peça a correção comentando na issue com "ajuste:" e o que mudar.</p></div>';
    }

    var chapas = (P.compras || []).filter(function (c) { return c.material; });
    var resumoCompra = chapas.map(function (c) { return num(c.quantidade) + " " + esc(c.unidade) + " de " + esc(c.item); }).join(" + ");

    var html = "";
    /* 1. resumo */
    html += '<section id="resumo" style="padding-top:8px"><p class="eyebrow">projeto ' + esc(n) + " · " + esc((P.data || "").split("-").reverse().join("/")) + "</p>" +
      "<h1>" + esc(P.titulo) + "</h1><p class=\"lead\">" + esc(P.resumo) + "</p>" +
      '<div class="hero"><div class="shot" id="heroIso"></div><div style="min-width:0"><div class="dims">' +
      '<div class="dim"><b>' + f1(medidas.largura || 0) + "</b><span>largura (cm)</span></div>" +
      '<div class="dim"><b>' + f1(medidas.profundidade || 0) + "</b><span>profundidade (cm)</span></div>" +
      '<div class="dim"><b>' + f1(medidas.altura || 0) + "</b><span>altura (cm)</span></div></div>" +
      '<dl class="facts"><dt>chapas</dt><dd>' + (resumoCompra || "—") + "</dd>" +
      "<dt>tempo</dt><dd>" + esc(P.tempo) + "</dd>" +
      "<dt>dificuldade</dt><dd>" + esc(P.dificuldade) + " de 5</dd>" +
      "<dt>premissas</dt><dd>" + (P.premissas || []).length + ' a conferir antes do corte · <a href="#premissas">ver →</a></dd></dl>' + selo +
      (+n > 0 ? '<p class="no-print" style="margin-top:12px"><a class="btn" href="../../pedir/#p' + (+n) + '">pedir ajuste neste projeto →</a></p>' : "") + "</div></div>" + naoCorte + "</section>";

    /* 2. premissas */
    var linhasPrem = (P.medidas_conhecidas || []).map(function (m) {
      return '<div><div><b>' + esc(m.nome) + '</b> <span class="tag med">MEDIDO</span></div><div class="v">' + num(m.valor) + " " + esc(m.unidade) + '</div><div class="note">' + esc(m.fonte) + "</div></div>";
    }).concat((P.premissas || []).map(function (m) {
      return '<div><div><b>' + esc(m.nome) + '</b> <span class="tag prem">PREMISSA</span></div><div class="v">' + num(m.valor) + " " + esc(m.unidade) + '</div><div class="note">Como conferir: ' + esc(m.como_conferir) + "</div></div>";
    }));
    html += '<section id="premissas"><p class="eyebrow">antes de cortar</p><h2>Premissas a confirmar</h2><p class="lead">O que foi medido nas fotos aparece como MEDIDO. O que eu estimei aparece como PREMISSA: meça antes de cortar e, se for diferente, peça um ajuste na issue.</p>' +
      '<div class="lista-prem">' + linhasPrem.join("") + "</div>" +
      ((P.perguntas || []).length ? '<div class="card" style="margin-top:16px"><h3>Dúvidas que ficaram</h3><ul>' + P.perguntas.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul></div>" : "") + "</section>";

    /* 3. 3D */
    html += '<section id="modelo"><p class="eyebrow">modelo interativo</p><h2>Modelo 3D</h2><p class="lead">Arraste para girar; roda do mouse ou dois dedos para aproximar. Toque numa peça para ver o nome e a medida.</p>' +
      '<div class="tools"><button class="btn" id="bExplode" type="button" aria-pressed="false">Vista explodida</button>' +
      '<button class="btn" id="bRefs" type="button" aria-pressed="true">Referências: mostrando</button>' +
      '<button class="btn" id="bFolgas" type="button" aria-pressed="false">Folgas: ocultas</button>' +
      '<button class="btn" id="bReset" type="button">Vista inicial</button></div>' +
      '<div class="viewer" id="viewer"><div class="tip" id="tip" hidden></div></div>' +
      '<div class="slider"><label for="sMontagem" class="note">montagem</label><input type="range" id="sMontagem" min="1" max="' + (passos.length + 1) + '" value="' + (passos.length + 1) + '" step="1"><output id="oMontagem" for="sMontagem">móvel montado</output></div>' +
      '<div class="legend">' + Object.keys(cores).map(function (g) { return '<span><span class="sw" style="background:' + cores[g] + '"></span>' + esc(g) + "</span>"; }).join("") +
      '<span><span class="sw" style="background:#ff2bd6"></span>peças do passo</span></div></section>';

    /* 4. lista de corte */
    if (C && C.lista_corte) {
      var bordaTxt = function (b) {
        var c = b.filter(function (x) { return x[0] === "C"; }).length, l = b.length - c;
        var p = []; if (c) p.push(c + (c > 1 ? " compridas" : " comprida")); if (l) p.push(l + (l > 1 ? " curtas" : " curta"));
        return p.length ? p.join(" + ") : "nenhuma";
      };
      html += '<section id="corte"><p class="eyebrow">o que cortar</p><h2>Lista de corte</h2><p class="lead">Medidas da peça pronta. Fita de borda nas bordas indicadas: "compridas" são as do comprimento, "curtas" as da largura.</p>' +
        '<div class="tbl-wrap"><table><thead><tr><th>peças</th><th>nome</th><th>qtd</th><th>comprimento (cm)</th><th>largura (cm)</th><th>espessura</th><th>veio</th><th>fita de borda</th></tr></thead><tbody>' +
        C.lista_corte.map(function (g) {
          var cor = porId[g.ids[0]] ? corDe(porId[g.ids[0]]) : "#ccc";
          return '<tr><td class="cod"><span class="sw" style="background:' + cor + '"></span>' + esc(g.ids.join(", ")) + "</td><td>" + esc(g.nomes.join(" / ")) + '</td><td class="n">' + g.qtd + '</td><td class="n">' + f1(g.comprimento) + '</td><td class="n">' + f1(g.largura) + '</td><td class="n">' + g.espessura_mm + " mm</td><td>" + esc(g.veio) + "</td><td>" + bordaTxt(g.bordas) + "</td></tr>";
        }).join("") + '</tbody></table></div><p class="note" style="margin-top:8px">Fita de borda: ' + f1(C.fita_total_m) + " m no total, sem sobra.</p></section>";

      /* 5. plano de corte */
      html += '<section id="plano"><p class="eyebrow">como as peças cabem</p><h2>Plano de corte</h2><p class="lead">1 cm de refilo em volta da chapa e 3 mm entre peças para o disco da serra. Muitas madeireiras cortam por um preço baixo se você levar este desenho.</p><div class="sheets">' +
        C.plano_corte.map(function (m) {
          return m.chapas.map(function (ch, i) {
            var SL = m.chapa.comprimento, SW = m.chapa.largura, pad = 10;
            var rects = ch.pecas.map(function (q) {
              var cor = porId[q.id] ? corDe(porId[q.id]) : "#ccc", t2 = f1(q.c) + " × " + f1(q.l);
              var lbl = q.l < 12 ? '<text class="lbs" x="' + (q.x + 1.5) + '" y="' + (q.y + q.l / 2 + 1.4) + '">' + esc(q.id) + " · " + t2 + "</text>"
                : '<text class="lb" x="' + (q.x + q.c / 2) + '" y="' + (q.y + q.l / 2) + '" text-anchor="middle">' + esc(q.id) + '</text><text class="lb2" x="' + (q.x + q.c / 2) + '" y="' + (q.y + q.l / 2 + 6.5) + '" text-anchor="middle">' + t2 + "</text>";
              return '<rect class="pc" x="' + q.x + '" y="' + q.y + '" width="' + q.c + '" height="' + q.l + '" fill="' + cor + '"/>' + lbl;
            }).join("");
            return '<div class="card plain"><h3>' + esc(m.nome) + (m.chapas.length > 1 ? " · chapa " + (i + 1) : "") + '</h3><p class="note" style="margin:0 0 10px">' + SL + " × " + SW + " cm · " + ch.pecas.length + " peças · aproveitamento " + Math.round(ch.aproveitamento * 100) + "%</p>" +
              '<svg class="sheet-svg" viewBox="' + (-pad) + " " + (-pad) + " " + (SL + 2 * pad) + " " + (SW + 2 * pad) + '" role="img" aria-label="Plano de corte de ' + esc(m.nome) + '">' +
              '<rect class="bd" x="0" y="0" width="' + SL + '" height="' + SW + '"/>' + rects +
              '<text class="dimt" x="' + SL / 2 + '" y="-3.5" text-anchor="middle">' + SL + ' cm</text><text class="dimt" x="-3" y="' + SW / 2 + '" text-anchor="middle" transform="rotate(-90 -3 ' + SW / 2 + ')">' + SW + " cm</text></svg></div>";
          }).join("");
        }).join("") + "</div></section>";
    }

    /* 6. compras */
    var cats = {}; (P.compras || []).forEach(function (c) { (cats[c.categoria || "Outros"] = cats[c.categoria || "Outros"] || []).push(c); });
    html += '<section id="compras"><p class="eyebrow">loja de madeira e ferragens</p><h2>Lista de compras</h2><div class="grid2">' +
      Object.keys(cats).map(function (k) {
        return '<div class="card"><h3>' + esc(k) + '</h3><ul class="buy">' + cats[k].map(function (c) {
          return '<li><span class="q">' + num(c.quantidade) + " " + esc(c.unidade) + "</span><span>" + esc(c.item) + (c.obs ? "<small>" + esc(c.obs) + "</small>" : "") + "</span></li>";
        }).join("") + "</ul></div>";
      }).join("") + "</div></section>";

    /* 7. ferramentas */
    var chk = guardado(chaveChk);
    html += '<section id="ferramentas"><p class="eyebrow">bancada</p><h2>Ferramentas</h2><div class="card plain"><ul class="marcar">' +
      (P.ferramentas || []).map(function (f, i) {
        return '<li><label for="fe' + i + '"><input type="checkbox" id="fe' + i + '" data-chk="fe' + i + '"' + (chk["fe" + i] ? " checked" : "") + "><span>" + esc(f.nome) + (f.uso ? "<small>" + esc(f.uso) + "</small>" : "") + "</span></label></li>";
      }).join("") + "</ul></div></section>";

    /* 8. passos */
    html += '<section id="montagem"><p class="eyebrow">do corte ao móvel em pé</p><h2>Montagem passo a passo</h2><p class="lead">Em cada desenho, as peças do passo aparecem em rosa com o código; o que já foi montado fica em cinza.</p><ol class="steps">' +
      passos.map(function (s, i) {
        var chips = (s.pecas || []).map(function (id) { var p = porId[id]; return p ? '<span class="tag"><span class="sw" style="background:' + corDe(p) + ';margin-right:4px"></span>' + esc(id) + " · " + esc(p.nome) + "</span>" : ""; }).join("");
        return '<li class="step"><div class="step-img" id="iso' + i + '"></div><div style="min-width:0"><div class="step-n">passo ' + (i + 1) + " de " + passos.length + "</div><h3>" + esc(s.titulo) + '</h3><div class="chips">' + chips + "</div>" + txt(s.texto) +
          (s.erro_comum ? '<div class="err"><b>erro comum</b>' + esc(s.erro_comum) + "</div>" : "") + "</div></li>";
      }).join("") + "</ol></section>";

    /* 9-10. acabamento e instalação */
    var cards = function (lista) { return '<div class="grid2">' + (lista || []).map(function (b) { return '<div class="card"><h3>' + esc(b.titulo) + "</h3>" + txt(b.texto) + "</div>"; }).join("") + "</div>"; };
    html += '<section id="acabamento"><p class="eyebrow">proteção</p><h2>Acabamento</h2>' + cards(P.acabamento) + "</section>";
    html += '<section id="instalacao"><p class="eyebrow">no lugar</p><h2>Instalação</h2>' + cards(P.instalacao) + "</section>";

    /* 11. checklist */
    html += '<section id="checklist"><p class="eyebrow">antes de usar</p><h2>Checklist final</h2><div class="card plain"><ul class="marcar">' +
      (P.checklist || []).map(function (t, i) { return '<li><label for="ck' + i + '"><input type="checkbox" id="ck' + i + '" data-chk="ck' + i + '"' + (chk["ck" + i] ? " checked" : "") + "><span>" + esc(t) + "</span></label></li>"; }).join("") + "</ul></div></section>";

    if ((P.glossario || []).length) html += '<section id="glossario"><p class="eyebrow">palavras da oficina</p><h2>Glossário</h2><div class="card plain"><dl class="glos">' +
      P.glossario.map(function (g) { return "<dt>" + esc(g.termo) + "</dt><dd>" + esc(g.definicao) + "</dd>"; }).join("") + "</dl></div></section>";
    if ((P.fotos || []).length) html += '<section id="fotos"><p class="eyebrow">referência</p><h2>Fotos do pedido</h2><div class="fotos">' +
      P.fotos.map(function (f, i) { return '<a href="' + esc(f) + '"><img loading="lazy" src="' + esc(f) + '" alt="Foto ' + (i + 1) + ' do pedido"></a>'; }).join("") + "</div></section>";

    html += '<p class="foot">oficina_ia · um projeto vini_lab · medidas em cm, espessuras em mm · ' + esc(P.id) + "</p>";
    app.innerHTML = html;

    /* desenhos isométricos */
    var todas = pecas.map(function (p) { return { caixa: p.caixa, cor: corDe(p) }; });
    document.getElementById("heroIso").innerHTML = Iso.svg(todas, { titulo: "Vista do móvel montado" });
    var feitas = [];
    passos.forEach(function (s, i) {
      var novas = (s.pecas || []).filter(function (id) { return porId[id]; });
      var boxes;
      if (novas.length) boxes = feitas.map(function (id) { return { caixa: porId[id].caixa, fantasma: true }; })
        .concat(novas.map(function (id) { return { caixa: porId[id].caixa, destaque: true, rotulo: id }; }));
      else boxes = (feitas.length ? feitas : pecas.map(function (p) { return p.id; })).map(function (id) { return { caixa: porId[id].caixa, cor: corDe(porId[id]) }; });
      document.getElementById("iso" + i).innerHTML = Iso.svg(boxes, { titulo: "Ilustração do passo " + (i + 1) });
      feitas = feitas.concat(novas);
    });

    app.addEventListener("change", function (e) {
      var k = e.target.getAttribute("data-chk"); if (!k) return;
      var s = guardado(chaveChk); s[k] = e.target.checked; guardar(chaveChk, s);
    });

    if (window.THREE && THREE.OrbitControls) iniciar3D(P, corDe, passoDe);
    else document.getElementById("viewer").insertAdjacentHTML("beforeend", '<div class="nogl">O 3D não carregou neste aparelho. Os desenhos dos passos e as tabelas continuam valendo.</div>');
  }

  /* ---------- 3D ---------- */
  function iniciar3D(P, corDe, passoDe) {
    var host = document.getElementById("viewer"), tip = document.getElementById("tip"), R;
    try { R = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { host.insertAdjacentHTML("beforeend", '<div class="nogl">Este aparelho não abriu o 3D. Os desenhos dos passos continuam valendo.</div>'); return; }
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.prepend(R.domElement);
    var scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8076, 0.85));
    var d1 = new THREE.DirectionalLight(0xffffff, 0.75); d1.position.set(60, 120, 90); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0xffffff, 0.25); d2.position.set(-80, 40, -60); scene.add(d2);

    var pecas = P.pecas || [];
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    pecas.forEach(function (p) { var c = p.caixa; for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], c[k]); mx[k] = Math.max(mx[k], c[k] + c[k + 3]); } });
    var cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, cy = (mn[1] + mx[1]) / 2;
    var tam = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    var edgeCor = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#222");
    var centro = function (c) { return new THREE.Vector3(c[0] + c[3] / 2 - cx, c[1] + c[4] / 2, c[2] + c[5] / 2 - cz); };

    var malhas = [];
    pecas.forEach(function (p) {
      var c = p.caixa, g = new THREE.BoxGeometry(c[3], c[4], c[5]);
      var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: corDe(p), roughness: 0.75 }));
      var base = centro(c); m.position.copy(base);
      var dir = new THREE.Vector3(base.x, base.y - cy, base.z), ex = dir.clone().multiplyScalar(0.45);
      var k = Math.abs(dir.x) >= Math.abs(dir.y) && Math.abs(dir.x) >= Math.abs(dir.z) ? "x" : (Math.abs(dir.y) >= Math.abs(dir.z) ? "y" : "z");
      ex[k] += (dir[k] >= 0 ? 1 : -1) * tam * 0.08;
      m.userData = { base: base, ex: ex, rot: p.id + " · " + p.nome, med: medidasPeca(c), passo: passoDe[p.id], cor: corDe(p) };
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: edgeCor, transparent: true, opacity: 0.5 })));
      scene.add(m); malhas.push(m);
    });

    var refs = new THREE.Group(), matRef = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.35, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    (P.referencias || []).forEach(function (r) {
      var c = r.caixa, geo, mesh;
      if (r.tipo === "cilindro") {
        var eixo = r.eixo || "y", alt = eixo === "x" ? c[3] : eixo === "z" ? c[5] : c[4];
        var raio = Math.min(eixo === "x" ? c[4] : c[3], eixo === "z" ? c[4] : c[5]) / 2;
        geo = new THREE.CylinderGeometry(raio, raio, alt, 24);
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.7, roughness: 0.3 }));
        if (eixo === "x") mesh.rotation.z = Math.PI / 2; if (eixo === "z") mesh.rotation.x = Math.PI / 2;
        mesh.position.copy(centro(c));
      } else if (r.tipo === "cuba") {
        geo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        mesh = new THREE.Mesh(geo, matRef);
        mesh.scale.set(c[3] / 2, c[4], c[5] / 2);
        mesh.position.set(c[0] + c[3] / 2 - cx, c[1] + c[4], c[2] + c[5] / 2 - cz);
      } else {
        geo = new THREE.BoxGeometry(c[3], c[4], c[5]); mesh = new THREE.Mesh(geo, matRef); mesh.position.copy(centro(c));
      }
      mesh.userData = { rot: r.nome, med: "referência, não é cortada" };
      refs.add(mesh);
    });
    scene.add(refs);

    var folgas = new THREE.Group();
    (P.folgas || []).forEach(function (f) {
      var c = f.caixa, g = new THREE.BoxGeometry(c[3], c[4], c[5]);
      var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.12, depthWrite: false }));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xff2bd6 })));
      m.position.copy(centro(c)); m.userData = { rot: "Folga: " + f.nome, med: "área que precisa ficar livre" };
      folgas.add(m);
    });
    folgas.visible = false; scene.add(folgas);

    var cam = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    var ctl = new THREE.OrbitControls(cam, R.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.minDistance = tam * 0.6; ctl.maxDistance = tam * 8;
    var reset = function () { cam.position.set(tam * 1.25, cy + tam * 1.05, tam * 1.9); ctl.target.set(0, cy, 0); ctl.update(); };
    reset();
    new ResizeObserver(function () { var w = host.clientWidth, h = host.clientHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }).observe(host);

    var exT = 0, exAlvo = 0;
    var aplicar = function () { malhas.forEach(function (m) { m.position.copy(m.userData.base).addScaledVector(m.userData.ex, exT); }); };
    var neon = new THREE.Color(0xff2bd6);
    var slider = document.getElementById("sMontagem"), out = document.getElementById("oMontagem"), passos = P.passos || [];
    var montar = function () {
      var v = +slider.value, tudo = v > passos.length;
      malhas.forEach(function (m) {
        var p = m.userData.passo, vis = tudo || p == null || p <= v - 1, novo = !tudo && p === v - 1;
        m.visible = vis; m.material.color.set(novo ? neon : m.userData.cor);
      });
      out.textContent = tudo ? "móvel montado" : "passo " + v + " de " + passos.length + " · " + passos[v - 1].titulo;
    };
    slider.addEventListener("input", montar);

    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    var pick = function (ev) {
      var r = R.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, cam);
      var alvos = malhas.filter(function (m) { return m.visible; }).concat(refs.visible ? refs.children : [], folgas.visible ? folgas.children : []);
      var hit = ray.intersectObjects(alvos, false)[0];
      malhas.forEach(function (m) { m.material.emissive && m.material.emissive.setHex(0); });
      if (hit && hit.object.userData.rot) {
        if (hit.object.material.emissive && malhas.indexOf(hit.object) >= 0) hit.object.material.emissive.setHex(0x3a0a32);
        tip.innerHTML = esc(hit.object.userData.rot) + "<small>" + esc(hit.object.userData.med) + "</small>";
        tip.style.left = (ev.clientX - r.left) + "px"; tip.style.top = (ev.clientY - r.top) + "px"; tip.hidden = false;
      } else tip.hidden = true;
    };
    R.domElement.addEventListener("pointermove", pick);
    R.domElement.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") pick(e); });
    R.domElement.addEventListener("pointerleave", function () { tip.hidden = true; });

    var alternar = function (id, obj, nome) {
      document.getElementById(id).onclick = function (e) {
        obj.visible = !obj.visible; e.currentTarget.setAttribute("aria-pressed", obj.visible);
        e.currentTarget.textContent = nome + ": " + (obj.visible ? "mostrando" : "ocultas");
      };
    };
    alternar("bRefs", refs, "Referências"); alternar("bFolgas", folgas, "Folgas");
    document.getElementById("bExplode").onclick = function (e) { exAlvo = exAlvo ? 0 : 1; e.currentTarget.setAttribute("aria-pressed", exAlvo ? "true" : "false"); };
    document.getElementById("bReset").onclick = reset;

    var primeiro = true;
    (function loop() {
      requestAnimationFrame(loop);
      if (Math.abs(exT - exAlvo) > 0.001) { exT += (exAlvo - exT) * 0.14; aplicar(); }
      ctl.update(); R.render(scene, cam);
      if (primeiro) { primeiro = false; window.__oficina3d = "ok"; }
    })();
  }
})();
