#!/usr/bin/env python3
"""Atualiza a galeria: docs/projetos/indice.json, lista de fotos de cada projeto e cópia da página-modelo.

Uso: python3 scripts/atualizar_indice.py [--raiz .]
"""
import argparse
import json
import shutil
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raiz", default=".")
    raiz = Path(ap.parse_args().raiz).resolve()
    docs = raiz / "docs"
    modelo = docs / "assets" / "modelo.html"
    indice = []
    for pasta in sorted((docs / "projetos").iterdir()):
        arq = pasta / "projeto.json"
        if not pasta.is_dir() or not arq.exists():
            continue
        try:
            proj = json.loads(arq.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"pulei {pasta.name}: projeto.json inválido ({e.msg})")
            continue
        fotos = sorted(f"fotos/{f.name}" for f in (pasta / "fotos").glob("*.jpg")) if (pasta / "fotos").exists() else []
        if proj.get("fotos") != fotos:
            proj["fotos"] = fotos
            arq.write_text(json.dumps(proj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.copyfile(modelo, pasta / "index.html")
        calc_arq = pasta / "calculado.json"
        status = "sem_validacao"
        if calc_arq.exists():
            status = json.loads(calc_arq.read_text(encoding="utf-8")).get("status", "sem_validacao")
        indice.append({
            "id": pasta.name,
            "titulo": proj.get("titulo", pasta.name),
            "resumo": proj.get("resumo", ""),
            "data": proj.get("data", ""),
            "dificuldade": proj.get("dificuldade"),
            "dimensoes_externas": proj.get("dimensoes_externas", {}),
            "status": status,
            "miniatura": [{"caixa": p["caixa"], "grupo": p.get("grupo", "")} for p in proj.get("pecas", []) if isinstance(p.get("caixa"), list)],
        })
    indice.sort(key=lambda p: p["id"], reverse=True)
    (docs / "projetos" / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"índice com {len(indice)} projeto(s)")


if __name__ == "__main__":
    main()
