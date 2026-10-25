#!/usr/bin/env python3
"""Transforma a issue do pedido em work/pedido.md + fotos.

Na Action, lê o evento em $GITHUB_EVENT_PATH e busca os comentários pela API.
Localmente: python3 scripts/preparar_pedido.py --evento evento.json [--comentarios comentarios.json] [--raiz .]

Variáveis: GITHUB_REPOSITORY, GITHUB_TOKEN, USUARIOS_PERMITIDOS (logins separados por vírgula), GITHUB_OUTPUT.
Saídas: work/pedido.md, work/meta.json, work/fotos/foto-NN.jpg (para o Claude),
docs/projetos/<id>/fotos/foto-NN.jpg (para publicar, sem EXIF).
"""
import argparse
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:  # HEIC fica sem suporte, o resto funciona
    pillow_heif = None

MAX_FOTOS = 12
MAX_BYTES = 30 * 1024 * 1024
LADO_CLAUDE = 1568   # bom para leitura de trena pelo modelo
LADO_PUBLICO = 1280

CAMPOS = {  # rótulo do formulário (começo, sem acento) -> chave
    "ideia": "ideia", "fotos": "fotos", "medidas": "medidas", "onde": "local", "local": "local",
    "material": "material", "extras": "extras",
}

RE_MD = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)")
RE_IMG = re.compile(r"<img[^>]+src=[\"'](https?://[^\"']+)[\"']", re.I)
RE_ANEXO = re.compile(r"https://github\.com/user-attachments/assets/[0-9a-fA-F-]{20,}")


def sem_acento(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def slugify(titulo):
    t = re.sub(r"^\s*\[?projeto\]?\s*[:\-–]?\s*", "", titulo, flags=re.I)
    s = re.sub(r"[^a-z0-9]+", "-", sem_acento(t)).strip("-")
    return (s[:40].rstrip("-") or "projeto")


def ler_formulario(corpo):
    """Issue forms viram blocos '### Rótulo' + resposta."""
    campos, atual = {}, None
    corpo = re.sub(r"<!--.*?-->", "", corpo or "", flags=re.S)
    for linha in corpo.splitlines():
        m = re.match(r"^###\s+(.+?)\s*$", linha)
        if m:
            rot = sem_acento(m.group(1))
            atual = next((v for k, v in CAMPOS.items() if rot.startswith(k)), rot)
            campos[atual] = []
        elif atual:
            campos[atual].append(linha)
    limpo = {}
    for k, linhas in campos.items():
        v = "\n".join(linhas).strip()
        limpo[k] = "" if v in ("_No response_", "_Sem resposta_", "None") else v
    if not campos:  # issue escrita à mão
        limpo["ideia"] = (corpo or "").strip()
    return limpo


def achar_imagens(texto):
    urls = []
    for rx in (RE_MD, RE_IMG, RE_ANEXO):
        for u in rx.findall(texto or ""):
            if u not in urls:
                urls.append(u)
    return urls


class SemAuthNoRedirect(urllib.request.HTTPRedirectHandler):
    """Anexos do GitHub redirecionam para um link assinado da Amazon, que recusa (400) o token do GitHub."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        novo = super().redirect_request(req, fp, code, msg, headers, newurl)
        if novo is not None and urllib.parse.urlparse(newurl).hostname != urllib.parse.urlparse(req.full_url).hostname:
            novo.remove_header("Authorization")
        return novo


ABRIR = urllib.request.build_opener(SemAuthNoRedirect)


def baixar(url, token):
    host = urllib.parse.urlparse(url).hostname or ""
    tentativas = [False]
    if token and (host == "github.com" or host.endswith(".githubusercontent.com")):
        tentativas.append(True)  # repositório privado: tenta de novo com o token
    erro = None
    for com_token in tentativas:
        req = urllib.request.Request(url, headers={"User-Agent": "oficina_ia", "Accept": "image/*,*/*"})
        if com_token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with ABRIR.open(req, timeout=60) as r:
                dados = r.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as e:
            erro = e
            continue
        if len(dados) > MAX_BYTES:
            raise ValueError("arquivo maior que 30 MB")
        return dados
    raise erro


def salvar(dados, destinos):
    img = Image.open(io.BytesIO(dados))
    img = ImageOps.exif_transpose(img)          # corrige a orientação da câmera
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    for caminho, lado, qualidade in destinos:
        c = img.copy()
        c.thumbnail((lado, lado))
        caminho.parent.mkdir(parents=True, exist_ok=True)
        c.save(caminho, "JPEG", quality=qualidade, optimize=True)  # sem exif: GPS e câmera não vão junto
    return img.size


def comentarios_api(repo, numero, token):
    todos, pagina = [], 1
    while True:
        url = f"https://api.github.com/repos/{repo}/issues/{numero}/comments?per_page=100&page={pagina}"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "oficina_ia"})
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=30) as r:
            lote = json.load(r)
        todos += lote
        if len(lote) < 100:
            return todos
        pagina += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evento", default=os.environ.get("GITHUB_EVENT_PATH"))
    ap.add_argument("--comentarios", help="JSON com a lista de comentários (teste local)")
    ap.add_argument("--raiz", default=".")
    a = ap.parse_args()
    if not a.evento:
        sys.exit("Informe --evento ou rode dentro da Action.")

    raiz = Path(a.raiz).resolve()
    evento = json.loads(Path(a.evento).read_text(encoding="utf-8"))
    issue = evento["issue"]
    numero = int(issue["number"])
    token = os.environ.get("GITHUB_TOKEN", "")
    permitidos = {u.strip().lower() for u in os.environ.get("USUARIOS_PERMITIDOS", "").split(",") if u.strip()}

    modo = "ajuste" if "comment" in evento else "novo"
    if a.comentarios:
        comentarios = json.loads(Path(a.comentarios).read_text(encoding="utf-8"))
    elif modo == "ajuste" or token:
        comentarios = comentarios_api(os.environ["GITHUB_REPOSITORY"], numero, token)
    else:
        comentarios = []
    # lista vazia = portão desligado: aceita ajuste de qualquer autor (menos bots)
    ajustes = [c for c in comentarios
               if (c.get("user", {}).get("login", "").lower() in permitidos
                   or (not permitidos and not c.get("user", {}).get("login", "").endswith("[bot]")))
               and sem_acento(c.get("body", "")).lstrip().startswith("ajuste")]

    # id NNN-slug: reaproveita a pasta se o número já existir
    projetos = raiz / "docs" / "projetos"
    prefixo = f"{numero:03d}-"
    candidatas = [p for p in projetos.glob(prefixo + "*") if p.is_dir()] if projetos.exists() else []
    existente = [p.name for p in sorted(candidatas, key=lambda p: (not (p / "projeto.json").exists(), p.name))]
    pid = existente[0] if existente else prefixo + slugify(issue.get("title", ""))
    pasta = projetos / pid
    pasta_rel = pasta.relative_to(raiz).as_posix()
    tem_projeto = (pasta / "projeto.json").exists()
    if modo == "ajuste" and not tem_projeto:
        modo = "novo"  # ajuste antes de existir projeto: gera do zero com tudo que há

    campos = ler_formulario(issue.get("body", ""))

    # fotos: formulário + comentários de ajuste
    urls = achar_imagens(issue.get("body", ""))
    for c in ajustes:
        for u in achar_imagens(c.get("body", "")):
            if u not in urls:
                urls.append(u)
    work = raiz / "work"
    (work / "fotos").mkdir(parents=True, exist_ok=True)
    for velho in (work / "fotos").glob("*.jpg"):
        velho.unlink()
    fotos, falhas = [], []
    for n, url in enumerate(urls[:MAX_FOTOS], 1):
        nome = f"foto-{n:02d}.jpg"
        try:
            tam = salvar(baixar(url, token), [(work / "fotos" / nome, LADO_CLAUDE, 88), (pasta / "fotos" / nome, LADO_PUBLICO, 80)])
            fotos.append({"arquivo": nome, "claude": f"work/fotos/{nome}", "tamanho_original": tam})
        except Exception as e:  # uma foto ruim não derruba o pedido
            falhas.append(f"{url} ({type(e).__name__}: {e})")
    if len(urls) > MAX_FOTOS:
        falhas.append(f"{len(urls) - MAX_FOTOS} foto(s) ignoradas: o limite é {MAX_FOTOS}.")

    linhas = [
        f"# Pedido #{numero}: {issue.get('title', '').strip()}",
        "",
        f"- **id do projeto**: `{pid}`",
        f"- **pasta**: `{pasta_rel}`",
        f"- **modo**: {modo}" + (" (refazer a partir do projeto.json atual)" if modo == "ajuste" else " (projeto novo)"),
        f"- **projeto.json existente**: {'sim' if tem_projeto else 'não'}",
        f"- **data**: {issue.get('created_at', '')[:10]}",
        "",
        "## Formulário",
        "",
    ]
    rotulos = [("ideia", "Ideia"), ("medidas", "Medidas que a pessoa já sabe"), ("local", "Onde o móvel vai ficar"), ("material", "Material"), ("extras", "Extras")]
    for k, rot in rotulos:
        v = campos.get(k, "")
        v = RE_MD.sub("[imagem]", v)
        linhas += [f"### {rot}", "", v or "(não informado)", ""]
    linhas += ["## Fotos", ""]
    if fotos:
        linhas += [f"- `{f['claude']}` (publicada como `fotos/{f['arquivo']}`)" for f in fotos]
    else:
        linhas.append("(nenhuma foto baixada)")
    if falhas:
        linhas += ["", "Fotos que não consegui baixar:"] + [f"- {x}" for x in falhas]
    linhas += ["", "## Ajustes pedidos (do mais antigo ao mais novo)", ""]
    if ajustes:
        for c in ajustes:
            corpo = re.sub(r"^\s*ajuste\s*:?\s*", "", c.get("body", ""), flags=re.I).strip()
            corpo = RE_MD.sub("[imagem]", corpo)
            linhas += [f"### {c.get('created_at', '')[:16].replace('T', ' ')} · {c['user']['login']}", "", corpo, ""]
    else:
        linhas.append("(nenhum)")

    (work / "pedido.md").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    meta = {"id": pid, "pasta": pasta_rel, "modo": modo, "numero": numero, "fotos": len(fotos), "falhas": falhas}
    (work / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    saida = os.environ.get("GITHUB_OUTPUT")
    if saida:
        with open(saida, "a", encoding="utf-8") as f:
            f.write(f"id={pid}\npasta={pasta_rel}\nmodo={modo}\nfotos={len(fotos)}\n")
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
