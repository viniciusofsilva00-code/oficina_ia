#!/usr/bin/env python3
"""Capturas de tela com Playwright: galeria e projeto 001 a 1280 px e 390 px.

Confere: nenhum erro no console, sem rolagem horizontal e 3D renderizado (window.__oficina3d).
Se a CDN não responder, serve o Three.js de tests/vendor/ via page.route.

Uso: pip install playwright && python -m playwright install chromium
     python tests/capturas.py
"""
import http.server
import sys
import threading
import urllib.request
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "tests" / "capturas"
VENDOR = RAIZ / "tests" / "vendor"
CDN = {
    "three.min.js": "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "OrbitControls.js": "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
}
PAGINAS = [("galeria", "/"), ("projeto-001", "/projetos/001-gabinete-pia-60/")]
LARGURAS = [1280, 390]


def garantir_vendor():
    VENDOR.mkdir(parents=True, exist_ok=True)
    for nome, url in CDN.items():
        alvo = VENDOR / nome
        if not alvo.exists():
            try:
                alvo.write_bytes(urllib.request.urlopen(url, timeout=30).read())
            except Exception as e:
                print(f"aviso: não baixei {nome} ({e}); vou depender da rede")


def main():
    garantir_vendor()
    SAIDA.mkdir(parents=True, exist_ok=True)
    handler = partial(Silencioso, directory=str(RAIZ / "docs"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    falhas = []

    def rota_cdn(route):
        nome = route.request.url.rsplit("/", 1)[-1]
        local = VENDOR / nome
        if local.exists():
            route.fulfill(path=str(local), content_type="application/javascript")
        else:
            route.continue_()

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for largura in LARGURAS:
            for esquema in ("light", "dark"):
                ctx = nav.new_context(viewport={"width": largura, "height": 900}, color_scheme=esquema, device_scale_factor=1)
                ctx.route("**/three.min.js", rota_cdn)
                ctx.route("**/OrbitControls.js", rota_cdn)
                ctx.route("https://fonts.googleapis.com/**", lambda r: r.continue_())
                for nome, caminho in PAGINAS:
                    pag = ctx.new_page()
                    erros = []
                    pag.on("console", lambda m, e=erros: e.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
                    pag.on("pageerror", lambda ex, e=erros: e.append(str(ex)))
                    pag.goto(base + caminho, wait_until="networkidle")
                    if nome.startswith("projeto"):
                        try:
                            pag.wait_for_function("window.__oficina3d === 'ok'", timeout=15000)
                            tem3d = True
                        except Exception:
                            tem3d = False
                        if not tem3d:
                            falhas.append(f"{nome} {largura}px {esquema}: 3D não renderizou")
                    pag.wait_for_timeout(400)
                    larg = pag.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                    if larg[0] > larg[1] + 1:
                        culpados = pag.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('.tbl-wrap')).slice(0, 5).map(e => e.tagName + '.' + e.className)""")
                        falhas.append(f"{nome} {largura}px {esquema}: rolagem horizontal ({larg[0]} > {larg[1]}): {culpados}")
                    if erros:
                        falhas.append(f"{nome} {largura}px {esquema}: erros no console: {erros}")
                    arq = SAIDA / f"{nome}-{largura}-{esquema}.png"
                    pag.screenshot(path=str(arq), full_page=True)
                    print(f"ok  {arq.relative_to(RAIZ)}")
                    pag.close()
                ctx.close()
        nav.close()
    srv.shutdown()
    if falhas:
        print("\nFALHAS:")
        for f in falhas:
            print("- " + f)
        return 1
    print("\nTodas as capturas passaram.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
