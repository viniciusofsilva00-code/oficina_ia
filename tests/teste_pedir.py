#!/usr/bin/env python3
"""Testa a página docs/pedir/ com a API do GitHub simulada (page.route): conectar, anexar foto, enviar e acompanhar.

Confere também que o corpo da issue criada é lido pelo preparar_pedido.ler_formulario.
Uso: python tests/teste_pedir.py
"""
import base64
import http.server
import io
import json
import sys
import threading
from functools import partial
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from preparar_pedido import achar_imagens, ler_formulario  # noqa: E402

SAIDA = RAIZ / "tests" / "capturas"
REPO = "dono/oficina_ia"


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    foto = SAIDA.parent / "tmp" / "trena.jpg"
    foto.parent.mkdir(exist_ok=True)
    Image.new("RGB", (2400, 1800), (190, 150, 110)).save(foto)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(Silencioso, directory=str(RAIZ / "docs")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    registro = {"puts": [], "issue": None, "comentarios": []}

    def api(route):
        req, url = route.request, route.request.url
        corpo = json.loads(req.post_data) if req.post_data else None
        assert req.headers.get("authorization") == "Bearer github_pat_teste", "token não enviado"
        if url.endswith("/repos/" + REPO):
            return route.fulfill(json={"default_branch": "main", "permissions": {"push": True}})
        if "/contents/entrada/" in url and req.method == "PUT":
            registro["puts"].append((url, corpo))
            return route.fulfill(status=201, json={"content": {}})
        if url.endswith("/issues") and req.method == "POST":
            registro["issue"] = corpo
            return route.fulfill(status=201, json={"number": 42})
        if url.endswith("/issues/42"):
            return route.fulfill(json={"number": 42, "title": registro["issue"]["title"], "state": "open", "created_at": "2026-10-25T20:00:00Z"})
        if "/issues/42/comments" in url and req.method == "POST":
            registro["comentarios"].append(corpo["body"])
            return route.fulfill(status=201, json={})
        if "/issues/42/comments" in url:
            coms = [{"user": {"login": "github-actions[bot]"}, "body": "Recebi o pedido. Estou montando o projeto.", "created_at": "2026-10-25T20:00:10Z"},
                    {"user": {"login": "github-actions[bot]"}, "body": "Projeto pronto: https://dono.github.io/oficina_ia/projetos/042-mesa/\n\nConfira as premissas.", "created_at": "2026-10-25T20:06:00Z"}]
            return route.fulfill(json=coms)
        return route.fulfill(status=404, json={"message": "não simulado: " + url})

    falhas = []
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        for largura in (390, 1280):
            ctx = nav.new_context(viewport={"width": largura, "height": 900})
            ctx.route("https://api.github.com/**", api)
            # a página descobre o repositório pelo endereço *.github.io; aqui o repositório vai na meta
            ctx.route("**/pedir/", lambda r: r.fulfill(response=r.fetch(), body=r.fetch().text().replace('name="oficina-repo" content=""', f'name="oficina-repo" content="{REPO}"')))
            pag = ctx.new_page()
            erros = []
            pag.on("pageerror", lambda e: erros.append(str(e)))
            pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
            pag.goto(base + "/pedir/#novo")
            pag.wait_for_selector("#conectar")
            pag.screenshot(path=str(SAIDA / f"pedir-conectar-{largura}.png"), full_page=True)
            pag.fill("#tk", "github_pat_teste")
            pag.click("#conectar")
            pag.wait_for_selector("#form")
            pag.fill("#ideia", "Mesa de decoração de festa, tampo retangular")
            pag.set_input_files("#arq", str(foto))
            pag.wait_for_selector("#minis img")
            pag.fill("#medidas", "120 x 60 cm, altura 75 cm")
            pag.check("input[value=\"Madeira maciça\"]")
            pag.screenshot(path=str(SAIDA / f"pedir-form-{largura}.png"), full_page=True)
            pag.click("#enviar")
            pag.wait_for_selector("text=Abrir o projeto", timeout=15000)
            pag.screenshot(path=str(SAIDA / f"pedir-status-{largura}.png"), full_page=True)
            pag.fill("#aj", "altura final 80 cm")
            pag.click("#bAj")
            pag.wait_for_timeout(800)
            larg = pag.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            if larg[0] > larg[1] + 1:
                falhas.append(f"{largura}px: rolagem horizontal {larg}")
            if erros:
                falhas.append(f"{largura}px: erros {erros}")
            ctx.close()
        nav.close()
    srv.shutdown()

    # o pedido criado é compatível com o preparador?
    iss = registro["issue"]
    campos = ler_formulario(iss["body"])
    imgs = achar_imagens(iss["body"])
    put_url, put = registro["puts"][0]
    img = Image.open(io.BytesIO(base64.b64decode(put["content"])))
    checks = {
        "rótulo projeto": iss["labels"] == ["projeto"],
        "título com prefixo": iss["title"].startswith("[projeto] Mesa de decoração"),
        "ideia lida": campos.get("ideia", "").startswith("Mesa de decoração"),
        "medidas lidas": campos.get("medidas") == "120 x 60 cm, altura 75 cm",
        "material lido": campos.get("material") == "Madeira maciça",
        "extras vazio": campos.get("extras") == "",
        "foto no corpo": len(imgs) == 1 and imgs[0].startswith("https://raw.githubusercontent.com/dono/oficina_ia/main/entrada/"),
        "foto reduzida para 1600 px em JPG": img.format == "JPEG" and max(img.size) == 1600,
        "ajuste com prefixo": registro["comentarios"] and registro["comentarios"][-1] == "ajuste: altura final 80 cm",
    }
    for k, ok in checks.items():
        print(("ok  " if ok else "XX  ") + k)
        if not ok:
            falhas.append(k)
    if falhas:
        print("\nFALHAS:", *falhas, sep="\n- ")
        return 1
    print("\nFluxo de pedido pelo site passou.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
