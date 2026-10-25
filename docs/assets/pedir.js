/* oficina_ia · pedir projeto pelo site. Fala com a API do GitHub usando um token guardado só neste aparelho. */
(function () {
  "use strict";
  var tela = document.getElementById("tela");
  var API = "https://api.github.com";
  var CHAVE = "oficina-token";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var repo = (document.querySelector('meta[name="oficina-repo"]') || {}).content || "";
  if (!repo && /\.github\.io$/.test(location.hostname)) repo = location.hostname.split(".")[0] + "/" + location.pathname.split("/").filter(Boolean)[0];
  var info = null, fotos = [], timer = null;

  function token() { try { return localStorage.getItem(CHAVE) || ""; } catch (e) { return ""; } }
  function gh(caminho, opt) {
    opt = opt || {};
    var h = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token(), "X-GitHub-Api-Version": "2022-11-28" };
    if (opt.body) h["Content-Type"] = "application/json";
    return fetch(caminho.indexOf("http") === 0 ? caminho : API + caminho, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: "no-store" })
      .then(function (r) {
        if (r.status === 204) return null;
        return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.message || ("erro " + r.status)); e.status = r.status; throw e; } return j; });
      });
  }
  var PERM = "Abra github.com/settings/personal-access-tokens, edite a chave e ligue ";
  function permissao(e, qual) {
    if (e && e.status === 403 && /personal access token/i.test(e.message)) {
      var x = new Error("Falta permissão na chave. " + PERM + qual + " = Read and write para " + repo.split("/")[1] + ". Depois toque em Enviar de novo; não precisa colar a chave outra vez");
      x.status = 403; throw x;
    }
    throw e;
  }
  function quando(iso) { var d = new Date(iso); return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

  /* ---------- roteamento por âncora ---------- */
  function rota() {
    clearInterval(timer);
    if (!repo) { tela.innerHTML = '<p class="lead">Configure o repositório na meta "oficina-repo" desta página.</p>'; return; }
    if (!token()) return telaConectar();
    var h = location.hash;
    var m = h.match(/^#p(\d+)$/);
    if (m) return telaPedido(+m[1]);
    if (h === "#pedidos") return telaLista();
    return telaNovo();
  }
  window.addEventListener("hashchange", rota);

  /* ---------- conectar o aparelho (uma vez) ---------- */
  function telaConectar(msg) {
    tela.innerHTML =
      '<p class="eyebrow">primeiro acesso neste aparelho</p><h1>Conectar a <span class="hl">oficina</span></h1>' +
      '<p class="lead">Os pedidos rodam no GitHub. Para enviar pelo site, este aparelho precisa de uma chave de acesso, criada uma vez só.</p>' +
      '<div class="card"><h3>Como criar a chave</h3><ol>' +
      '<li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>' +
      "<li>Nome: <b>oficina</b>. Validade: a que preferir.</li>" +
      "<li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> e marque <b>" + esc(repo.split("/")[1]) + "</b>.</li>" +
      "<li>Em <b>Permissions → Repository permissions</b>: <b>Contents</b> = Read and write; <b>Issues</b> = Read and write.</li>" +
      "<li>Toque em <b>Generate token</b>, copie e cole aqui embaixo.</li></ol></div>" +
      '<div class="passo-form" style="margin-top:20px"><label for="tk">Chave de acesso</label><input class="campo" id="tk" type="password" autocomplete="off" placeholder="github_pat_…">' +
      '<p class="dica">Fica guardada só neste aparelho. Ela dá acesso apenas a este repositório.</p></div>' +
      (msg ? '<p class="erro-msg">' + esc(msg) + "</p>" : "") +
      '<button class="btn pri enviar" id="conectar" type="button">Conectar</button>';
    document.getElementById("conectar").onclick = function () {
      var v = document.getElementById("tk").value.trim();
      if (!v) return;
      try { localStorage.setItem(CHAVE, v); } catch (e) { return telaConectar("Este navegador não deixa guardar a chave. Tente sair do modo anônimo."); }
      info = null;
      carregarInfo().then(rota).catch(function (e) { try { localStorage.removeItem(CHAVE); } catch (x) { /* nada */ } telaConectar(e.message); });
    };
  }

  function carregarInfo() {
    if (info) return Promise.resolve(info);
    return gh("/repos/" + repo).then(function (r) {
      if (!r.permissions || !r.permissions.push) throw new Error("A chave funciona, mas não tem permissão de escrita em " + repo + ". Confira Contents e Issues = Read and write.");
      info = r;
      return gh("/repos/" + repo + "/labels/projeto").then(function () { return r; });
    }).catch(function (e) {
      if (e.status === 401) throw new Error("Chave recusada pelo GitHub. Confira se copiou inteira e se não venceu.");
      if (e.status === 404) throw new Error("A chave não enxerga " + repo + ". Marque esse repositório em Repository access.");
      if (e.status === 403) throw new Error("A chave não tem a permissão Issues. Edite a chave e ligue Contents e Issues = Read and write.");
      throw e;
    });
  }

  function abas(ativa) {
    return '<div class="abas"><a class="btn' + (ativa === "novo" ? " pri" : "") + '" href="#novo">novo pedido</a><a class="btn' + (ativa === "lista" ? " pri" : "") + '" href="#pedidos">meus pedidos</a></div>';
  }

  /* ---------- novo pedido ---------- */
  var MATERIAIS = ["Não sei, escolha por mim", "MDF RU (resistente à umidade)", "Compensado naval", "MDF comum (lugar seco)", "Madeira maciça"];
  function telaNovo() {
    fotos = [];
    tela.innerHTML = abas("novo") +
      '<p class="eyebrow">novo pedido</p><h1>O que vamos <span class="hl">construir</span>?</h1>' +
      '<p class="lead">Conte a ideia e mande fotos com a trena aparecendo. Em uns 10 minutos o projeto volta pronto, com 3D, lista de corte e passo a passo.</p>' +
      '<form id="form" novalidate>' +
      '<div class="passo-form"><label for="ideia"><span class="n">1</span>A ideia</label><textarea class="campo" id="ideia" required placeholder="Ex.: gabinete para a pia do banheiro, com 2 portas"></textarea></div>' +
      '<div class="passo-form"><span class="rot"><span class="n">2</span>Fotos</span><p class="dica">Encoste a trena em cada medida e fotografe de frente, com o número legível. Até 12 fotos.</p>' +
      '<label class="solta" for="arq"><input type="file" id="arq" accept="image/*" multiple>Tirar foto ou escolher da galeria<small>JPG ou PNG; no iPhone, o próprio aparelho converte</small></label>' +
      '<div class="miniaturas" id="minis"></div></div>' +
      '<div class="passo-form"><label for="medidas"><span class="n">3</span>Medidas que você já sabe <span class="muted" style="font-weight:400">(opcional)</span></label><textarea class="campo" id="medidas" placeholder="Ex.: pia 60 x 45 cm; altura até a pia 85 cm"></textarea></div>' +
      '<div class="passo-form"><label for="local"><span class="n">4</span>Onde vai ficar <span class="muted" style="font-weight:400">(opcional)</span></label><input class="campo" id="local" placeholder="Ex.: banheiro, encostado na parede"></div>' +
      '<div class="passo-form"><span class="rot"><span class="n">5</span>Material</span><div class="opcoes" role="radiogroup">' +
      MATERIAIS.map(function (m, i) { return '<label><input type="radio" name="mat" value="' + esc(m) + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(m) + "</span></label>"; }).join("") + "</div></div>" +
      '<div class="passo-form"><label for="extras"><span class="n">6</span>Detalhes <span class="muted" style="font-weight:400">(opcional)</span></label><textarea class="campo" id="extras" placeholder="Cor, puxador, ferramentas que você tem…"></textarea></div>' +
      '<div id="aviso"></div><button class="btn pri enviar" type="submit" id="enviar">Enviar pedido →</button><p class="progresso" id="prog" aria-live="polite"></p></form>' +
      '<p class="note" style="margin-top:28px">Conectado a ' + esc(repo) + ' · <a href="#" id="sair">desconectar este aparelho</a></p>';
    document.getElementById("arq").addEventListener("change", function (e) { adicionarFotos(e.target.files); e.target.value = ""; });
    document.getElementById("form").addEventListener("submit", function (e) { e.preventDefault(); enviar(); });
    document.getElementById("sair").onclick = function (e) { e.preventDefault(); try { localStorage.removeItem(CHAVE); } catch (x) { /* nada */ } info = null; rota(); };
  }

  function adicionarFotos(lista) {
    Array.prototype.slice.call(lista).forEach(function (f) {
      if (fotos.length >= 12) return;
      preparar(f).then(function (blob) { fotos.push({ blob: blob, url: URL.createObjectURL(blob) }); desenharMinis(); })
        .catch(function () { aviso("Não consegui abrir " + f.name + ". Use uma foto JPG ou PNG."); });
    });
  }
  function desenharMinis() {
    var el = document.getElementById("minis"); if (!el) return;
    el.innerHTML = fotos.map(function (f, i) { return '<figure><img src="' + f.url + '" alt="Foto ' + (i + 1) + '"><button type="button" data-i="' + i + '" aria-label="Remover foto ' + (i + 1) + '">×</button></figure>'; }).join("");
    el.querySelectorAll("button").forEach(function (b) { b.onclick = function () { fotos.splice(+b.getAttribute("data-i"), 1); desenharMinis(); }; });
  }
  function aviso(t) { var a = document.getElementById("aviso"); if (a) a.innerHTML = t ? '<p class="erro-msg">' + esc(t) + "</p>" : ""; }

  /* reduz para 1600 px, aplica a orientação da câmera e grava em JPG */
  function preparar(file) {
    var abrir = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject();
    return abrir.catch(function () {
      return new Promise(function (ok, falha) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = falha; im.src = URL.createObjectURL(file); });
    }).then(function (img) {
      var w = img.width, h = img.height, k = Math.min(1, 1600 / Math.max(w, h));
      var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (ok, falha) { c.toBlob(function (b) { b ? ok(b) : falha(); }, "image/jpeg", 0.85); });
    });
  }
  function base64(blob) { return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.readAsDataURL(blob); }); }

  function enviar() {
    var v = function (id) { return document.getElementById(id).value.trim(); };
    var ideia = v("ideia");
    if (!ideia) { aviso("Escreva a ideia do móvel."); document.getElementById("ideia").focus(); return; }
    if (!fotos.length) { aviso("Mande pelo menos uma foto."); return; }
    aviso("");
    var btn = document.getElementById("enviar"), prog = document.getElementById("prog");
    btn.disabled = true; btn.textContent = "Enviando…";
    var d = new Date(), pasta = "entrada/" + d.toISOString().slice(0, 19).replace(/[-:T]/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    var urls = [];
    carregarInfo().then(function () {
      var ramo = info.default_branch;
      return fotos.reduce(function (p, f, i) {
        return p.then(function () {
          prog.textContent = "enviando foto " + (i + 1) + " de " + fotos.length + "…";
          var nome = pasta + "/foto-" + String(i + 1).padStart(2, "0") + ".jpg";
          return base64(f.blob).then(function (b64) {
            return gh("/repos/" + repo + "/contents/" + nome, { method: "PUT", body: { message: "pedido: foto " + (i + 1), content: b64, branch: ramo } })
              .catch(function (e) { permissao(e, "Contents"); });
          }).then(function () { urls.push("https://raw.githubusercontent.com/" + repo + "/" + ramo + "/" + nome); });
        });
      }, Promise.resolve());
    }).then(function () {
      prog.textContent = "criando o pedido…";
      var sec = function (t, c) { return "### " + t + "\n\n" + (c || "_No response_") + "\n\n"; };
      var mat = (document.querySelector('input[name="mat"]:checked') || {}).value;
      var corpo = "<!-- enviado pelo site da oficina_ia -->\n\n" + sec("Ideia", ideia) + sec("Fotos", urls.map(function (u, i) { return "![foto " + (i + 1) + "](" + u + ")"; }).join("\n\n")) +
        sec("Medidas que você já sabe", v("medidas")) + sec("Onde o móvel vai ficar", v("local")) + sec("Material", mat) + sec("Extras", v("extras"));
      var titulo = "[projeto] " + ideia.split("\n")[0].slice(0, 70);
      return gh("/repos/" + repo + "/issues", { method: "POST", body: { title: titulo, body: corpo, labels: ["projeto"] } })
        .catch(function (e) { permissao(e, "Issues"); });
    }).then(function (issue) {
      location.hash = "#p" + issue.number;
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "Enviar pedido →"; prog.textContent = "";
      aviso(e.status === 403 ? e.message + "." : "Não consegui enviar: " + e.message + ". Tente de novo.");
    });
  }

  /* ---------- estado de um pedido a partir dos comentários ---------- */
  function estado(issue, coms) {
    var e = { cod: "fila", rot: "na fila", link: null, texto: "" };
    coms.forEach(function (c) {
      var bot = /\[bot\]$/.test(c.user.login), b = c.body || "";
      if (!bot && /^\s*ajuste/i.test(b)) e = { cod: "fila", rot: "ajuste na fila", link: e.link, texto: "" };
      else if (bot && /^Recebi o pedido/.test(b)) e = { cod: "gerando", rot: "gerando", link: e.link, texto: "" };
      else if (bot && /^Projeto pronto/.test(b)) e = { cod: "pronto", rot: "pronto", link: (b.match(/https:\/\/\S+?\.github\.io\/\S+/) || [null])[0], texto: "" };
      else if (bot && /não fechou/.test(b)) e = { cod: "erro", rot: "não fechou", link: (b.match(/https:\/\/\S+?\.github\.io\/\S+/) || [null])[0], texto: b };
      else if (bot && /^Antes de montar/.test(b)) e = { cod: "perguntas", rot: "tem perguntas", link: e.link, texto: b };
      else if (bot && /^Algo deu errado/.test(b)) e = { cod: "falha", rot: "falhou", link: e.link, texto: "" };
    });
    if (issue.state === "closed" && e.cod !== "pronto") e = { cod: "erro", rot: "encerrado", link: e.link, texto: "" };
    return e;
  }

  function telaLista() {
    tela.innerHTML = abas("lista") + '<p class="eyebrow">acompanhamento</p><h1>Meus <span class="hl">pedidos</span></h1><div class="pedidos" id="lista"><p class="note">carregando…</p></div>';
    gh("/repos/" + repo + "/issues?labels=projeto&state=all&per_page=30&sort=created&direction=desc").then(function (lista) {
      var el = document.getElementById("lista");
      if (!lista.length) { el.innerHTML = '<p class="note">Nenhum pedido ainda. <a href="#novo">Fazer o primeiro →</a></p>'; return; }
      el.innerHTML = lista.map(function (i) {
        return '<a class="card plain pedido" href="#p' + i.number + '"><div style="min-width:0"><span class="meta">#' + i.number + " · " + quando(i.created_at) + "</span><h3>" + esc(i.title.replace(/^\[projeto\]\s*/i, "")) +
          '</h3></div><span class="estado e-fila" id="st' + i.number + '">…</span></a>';
      }).join("");
      lista.forEach(function (i) {
        gh(i.comments_url + "?per_page=100").then(function (c) {
          var e = estado(i, c), s = document.getElementById("st" + i.number);
          if (s) { s.className = "estado e-" + e.cod; s.textContent = e.rot; }
        });
      });
    }).catch(function (e) { document.getElementById("lista").innerHTML = '<p class="erro-msg">' + esc(e.message) + "</p>"; });
  }

  function telaPedido(n) {
    tela.innerHTML = '<a class="voltar" href="#pedidos">← meus pedidos</a><div id="ped"><p class="note" style="margin-top:16px">carregando…</p></div>';
    var desenhar = function () {
      Promise.all([gh("/repos/" + repo + "/issues/" + n), gh("/repos/" + repo + "/issues/" + n + "/comments?per_page=100")]).then(function (r) {
        var issue = r[0], coms = r[1], e = estado(issue, coms), el = document.getElementById("ped");
        if (!el) return;
        var andando = e.cod === "fila" || e.cod === "gerando";
        var topo = {
          fila: '<span class="pulso"></span>Pedido recebido. Começa em instantes.',
          gerando: '<span class="pulso"></span>Gerando o projeto. Costuma levar de 5 a 10 minutos; pode deixar esta tela aberta.',
          pronto: "Projeto pronto.",
          perguntas: "Antes de montar, a oficina precisa de mais informação. Responda logo abaixo.",
          erro: "O projeto foi publicado, mas as medidas não fecharam. Não corte nada; peça um ajuste.",
          falha: "Algo deu errado na geração. Peça um ajuste para tentar de novo."
        }[e.cod];
        var timeline = coms.filter(function (c) { return !/\[bot\]$/.test(c.user.login) || !/^Recebi o pedido/.test(c.body); }).map(function (c) {
          var bot = /\[bot\]$/.test(c.user.login);
          var corpo = esc(c.body).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
          return '<li class="' + (bot ? "" : "eu") + '"><span class="quem">' + (bot ? "oficina" : "você") + " · " + quando(c.created_at) + "</span>" + corpo + "</li>";
        }).join("");
        el.innerHTML = '<p class="eyebrow" style="margin-top:16px">pedido #' + n + " · " + quando(issue.created_at) + '</p><h1 style="font-size:clamp(1.7rem,5vw,2.4rem)">' + esc(issue.title.replace(/^\[projeto\]\s*/i, "")) + "</h1>" +
          '<div class="seal ' + (e.cod === "pronto" ? "ok" : (e.cod === "erro" || e.cod === "falha") ? "bad" : "none") + '"><span class="ico">' + esc(e.rot) + "</span><div>" + topo + "</div></div>" +
          (e.link ? '<p style="margin:16px 0"><a class="btn pri enviar" href="' + esc(e.link) + '">Abrir o projeto →</a></p>' : "") +
          (timeline ? '<h3 style="margin-top:24px">Conversa</h3><ul class="linha-tempo">' + timeline + "</ul>" : "") +
          (andando ? "" : '<div class="passo-form" style="margin-top:20px"><label for="aj">' + (e.cod === "perguntas" ? "Sua resposta" : "Pedir um ajuste") + '</label><textarea class="campo" id="aj" placeholder="' +
            (e.cod === "perguntas" ? "Ex.: a mesa tem 120 x 60 cm e 75 cm de altura, tampo reto" : "Ex.: a altura final é 80 cm") + '"></textarea></div><button class="btn pri enviar" id="bAj" type="button">Enviar</button><p class="progresso" id="pAj"></p>');
        var b = document.getElementById("bAj");
        if (b) b.onclick = function () {
          var t = document.getElementById("aj").value.trim(); if (!t) return;
          b.disabled = true; document.getElementById("pAj").textContent = "enviando…";
          gh("/repos/" + repo + "/issues/" + n + "/comments", { method: "POST", body: { body: "ajuste: " + t } }).catch(function (e) { permissao(e, "Issues"); }).then(desenhar)
            .catch(function (x) { b.disabled = false; document.getElementById("pAj").textContent = "Não consegui enviar: " + x.message; });
        };
        clearInterval(timer);
        if (andando) timer = setInterval(desenhar, 12000);
      }).catch(function (x) { var el = document.getElementById("ped"); if (el) el.innerHTML = '<p class="erro-msg">' + esc(x.message) + "</p>"; });
    };
    desenhar();
  }

  rota();
})();
