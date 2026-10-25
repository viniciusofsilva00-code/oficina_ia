#!/usr/bin/env python3
"""Valida um projeto da oficina_ia e gera calculado.json.

Uso: python3 scripts/validar_projeto.py docs/projetos/<NNN-slug>
Saída: 0 = aprovado, 1 = tem erros (calculado.json gravado mesmo assim), 2 = arquivo ausente ou ilegível.

As mensagens de erro dizem o que está errado e o que mexer, para o Claude conseguir corrigir.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

TOL = 0.05        # cm
SERRA = 0.3       # espessura do disco, cm
REFILO = 1.0      # borda da chapa descartada, cm
EIXOS = "xyz"
NOMES_EIXO = {"x": "largura", "y": "altura", "z": "profundidade"}

CAMPOS = {
    "titulo": str, "resumo": str, "pedido_original": str, "data": str, "dificuldade": (int, float),
    "tempo": str, "dimensoes_externas": dict, "medidas_conhecidas": list, "premissas": list,
    "perguntas": list, "conferencias": list, "materiais": list, "pecas": list, "referencias": list,
    "folgas": list, "compras": list, "ferramentas": list, "passos": list, "acabamento": list,
    "instalacao": list, "checklist": list, "glossario": list, "fotos": list,
}


def cm(v):
    return f"{v:.1f}".replace(".", ",")


class Relatorio:
    def __init__(self):
        self.erros, self.avisos, self.verificacoes = [], [], []

    def erro(self, codigo, msg):
        self.erros.append({"codigo": codigo, "msg": msg})

    def aviso(self, codigo, msg):
        self.avisos.append({"codigo": codigo, "msg": msg})

    def ok(self, txt):
        self.verificacoes.append(txt)


def limites(caixa):
    x, y, z, w, h, d = caixa
    return (x, y, z), (x + w, y + h, z + d)


def intersecao(a, b):
    """Extensão da interseção em cada eixo (negativa = separadas)."""
    (amin, amax), (bmin, bmax) = limites(a), limites(b)
    return [min(amax[k], bmax[k]) - max(amin[k], bmin[k]) for k in range(3)]


def caixa_valida(c):
    return isinstance(c, list) and len(c) == 6 and all(isinstance(v, (int, float)) for v in c) and all(v > 0 for v in c[3:])


def medidas_corte(peca, material):
    """(comprimento, largura, espessura_cm, eixo_espessura, pode_girar)."""
    dims = peca["caixa"][3:]
    k_esp = min(range(3), key=lambda k: dims[k])
    outros = [k for k in range(3) if k != k_esp]
    veio = peca.get("veio", "livre")
    pode_girar = veio == "livre" or not material.get("veio", False)
    if veio in EIXOS and EIXOS.index(veio) in outros:
        kc = EIXOS.index(veio)
        kl = [k for k in outros if k != kc][0]
    else:
        kc, kl = sorted(outros, key=lambda k: -dims[k])
    return dims[kc], dims[kl], dims[k_esp], k_esp, pode_girar


def empacotar(itens, chapa_c, chapa_l):
    """Prateleiras (guilhotina simples). Veio corre no comprimento da chapa."""
    uc, ul = chapa_c - 2 * REFILO, chapa_l - 2 * REFILO
    ordem = sorted(itens, key=lambda i: (-i["l"], -i["c"]))
    chapas, grandes = [], []

    def tentar(chapa, it):
        orient = [(it["c"], it["l"], False)]
        if it["girar"]:
            orient.append((it["l"], it["c"], True))
        for a, b, rot in orient:
            for p in chapa["prateleiras"]:
                if b <= p["h"] + 1e-9 and p["x"] + a <= uc + 1e-9:
                    chapa["pecas"].append({"id": it["id"], "x": round(REFILO + p["x"], 2), "y": round(REFILO + p["y"], 2), "c": a, "l": b, "girada": rot})
                    p["x"] += a + SERRA
                    return True
        for a, b, rot in orient:
            y = chapa["usado"]
            if a <= uc + 1e-9 and y + b <= ul + 1e-9:
                chapa["prateleiras"].append({"y": y, "h": b, "x": a + SERRA})
                chapa["usado"] = y + b + SERRA
                chapa["pecas"].append({"id": it["id"], "x": REFILO, "y": round(REFILO + y, 2), "c": a, "l": b, "girada": rot})
                return True
        return False

    for it in ordem:
        cabe = (it["c"] <= uc and it["l"] <= ul) or (it["girar"] and it["l"] <= uc and it["c"] <= ul)
        if not cabe:
            grandes.append(it)
            continue
        if not any(tentar(ch, it) for ch in chapas):
            ch = {"prateleiras": [], "usado": 0.0, "pecas": []}
            chapas.append(ch)
            tentar(ch, it)
    for ch in chapas:
        area = sum(p["c"] * p["l"] for p in ch["pecas"])
        ch["aproveitamento"] = round(area / (chapa_c * chapa_l), 3)
        del ch["prateleiras"], ch["usado"]
    return chapas, grandes


def validar(proj):
    R = Relatorio()
    calc = {"status": "erro", "erros": R.erros, "avisos": R.avisos, "verificacoes": R.verificacoes}

    # 1. campos obrigatórios
    for campo, tipo in CAMPOS.items():
        if campo not in proj:
            R.erro("campo_ausente", f"Falta o campo '{campo}'. Veja prompt/ESQUEMA.md.")
        elif not isinstance(proj[campo], tipo):
            R.erro("campo_tipo", f"O campo '{campo}' tem o tipo errado (esperado {tipo if isinstance(tipo, type) else 'número'}).")
    dimensoes = proj.get("dimensoes_externas") if isinstance(proj.get("dimensoes_externas"), dict) else {}
    for k in ("largura", "altura", "profundidade"):
        if not isinstance(dimensoes.get(k), (int, float)):
            R.erro("campo_ausente", f"Falta dimensoes_externas.{k} (número em cm).")
    if R.erros:
        return calc

    materiais = {m.get("id"): m for m in proj["materiais"]}
    pecas = proj["pecas"]
    if not pecas:
        R.erro("sem_pecas", "A lista 'pecas' está vazia.")
        return calc

    # 2. ids únicos e formato das caixas
    vistos = {}
    for grupo in ("pecas", "referencias", "folgas"):
        for item in proj[grupo]:
            i = item.get("id")
            if not i:
                R.erro("id_ausente", f"Um item de '{grupo}' está sem 'id'.")
                continue
            if i in vistos:
                R.erro("id_repetido", f"O id '{i}' aparece em '{vistos[i]}' e em '{grupo}'. Cada id precisa ser único.")
            vistos[i] = grupo
            if not caixa_valida(item.get("caixa")):
                R.erro("caixa_invalida", f"'{i}' precisa de 'caixa' = [x, y, z, largura, altura, profundidade] com medidas positivas, em cm.")
    for m in proj["materiais"]:
        if not isinstance(m.get("espessura_mm"), (int, float)):
            R.erro("material_invalido", f"O material '{m.get('id')}' precisa de 'espessura_mm'.")
        if m.get("tipo", "chapa") not in ("chapa", "tabua"):
            R.erro("material_invalido", f"O material '{m.get('id')}' tem tipo '{m.get('tipo')}'. Use 'chapa' ou 'tabua'.")
        ch = m.get("chapa") or {}
        if not all(isinstance(ch.get(k), (int, float)) for k in ("comprimento", "largura")):
            R.erro("material_invalido", f"O material '{m.get('id')}' precisa de 'chapa': {{'comprimento', 'largura'}} em cm (para tábua: comprimento e largura da tábua comprada).")
    if R.erros:
        return calc

    # 3. espessura = material
    for p in pecas:
        m = materiais.get(p.get("material"))
        if not m:
            R.erro("material_inexistente", f"A peça {p['id']} usa o material '{p.get('material')}', que não está em 'materiais'.")
            continue
        esp = m["espessura_mm"] / 10
        dims = p["caixa"][3:]
        menor = min(dims)
        if abs(menor - esp) > TOL:
            eixo = EIXOS[dims.index(menor)]
            R.erro("espessura", f"A peça {p['id']} ({p.get('nome', '')}) tem {cm(menor)} cm na {NOMES_EIXO[eixo]}, mas o material {m['nome']} tem {cm(esp)} cm. Ajuste essa medida da caixa para {cm(esp)}.")
        veio = p.get("veio", "livre")
        if veio not in ("x", "y", "z", "livre"):
            R.erro("veio_invalido", f"A peça {p['id']} tem veio '{veio}'. Use 'x', 'y', 'z' ou 'livre'.")
        elif veio != "livre" and abs(dims[EIXOS.index(veio)] - menor) <= TOL and dims.count(menor) == 1:
            R.erro("veio_invalido", f"O veio da peça {p['id']} está no eixo da espessura ({veio}). Indique o eixo do comprimento da peça.")
        for b in p.get("bordas", []):
            if b not in ("C1", "C2", "L1", "L2"):
                R.erro("borda_invalida", f"A peça {p['id']} tem borda '{b}'. Use C1, C2, L1 ou L2.")
    if any(e["codigo"] == "material_inexistente" for e in R.erros):
        return calc
    if not any(e["codigo"] == "espessura" for e in R.erros):
        R.ok("Espessura de todas as peças igual à do material")

    # 4. sobreposição
    sobre = 0
    for a in range(len(pecas)):
        for b in range(a + 1, len(pecas)):
            ext = intersecao(pecas[a]["caixa"], pecas[b]["caixa"])
            if all(e > TOL for e in ext):
                sobre += 1
                pa, pb = pecas[a], pecas[b]
                R.erro("sobreposicao", f"As peças {pa['id']} ({pa.get('nome', '')}) e {pb['id']} ({pb.get('nome', '')}) ocupam o mesmo espaço: {cm(ext[0])} × {cm(ext[1])} × {cm(ext[2])} cm (largura × altura × profundidade). Mova uma delas ou reduza a medida que invade.")
    if not sobre:
        R.ok(f"Nenhuma peça ocupa o lugar de outra ({len(pecas)} peças)")

    # 5. medidas externas
    mins = [min(limites(p["caixa"])[0][k] for p in pecas) for k in range(3)]
    maxs = [max(limites(p["caixa"])[1][k] for p in pecas) for k in range(3)]
    reais = {"largura": round(maxs[0] - mins[0], 2), "altura": round(maxs[1] - mins[1], 2), "profundidade": round(maxs[2] - mins[2], 2)}
    calc["medidas_reais"] = reais
    ext_ok = True
    for k in ("largura", "altura", "profundidade"):
        if abs(reais[k] - dimensoes[k]) > TOL:
            ext_ok = False
            R.erro("medida_externa", f"A {k} das peças somadas dá {cm(reais[k])} cm, mas dimensoes_externas.{k} diz {cm(dimensoes[k])} cm. Corrija a dimensão declarada ou as peças.")
    if min(mins) < -TOL:
        R.aviso("origem", "Alguma peça está antes da origem (x, y ou z negativo). A origem fica no canto de trás, à esquerda, no chão.")
    if ext_ok:
        R.ok(f"Medidas externas conferem: {cm(reais['largura'])} × {cm(reais['profundidade'])} × {cm(reais['altura'])} cm")

    # 6. folgas
    inv = 0
    for f in proj["folgas"]:
        for p in pecas:
            ext = intersecao(f["caixa"], p["caixa"])
            if all(e > TOL for e in ext):
                inv += 1
                R.erro("folga_invadida", f"A peça {p['id']} ({p.get('nome', '')}) invade a folga '{f.get('nome', f['id'])}' em {cm(ext[0])} × {cm(ext[1])} × {cm(ext[2])} cm. Essa área precisa ficar livre: mova, corte ou recue a peça.")
    if proj["folgas"] and not inv:
        R.ok(f"Áreas livres respeitadas ({len(proj['folgas'])} folgas)")

    # 7. conferências
    conf_ok = 0
    for c in proj["conferencias"]:
        soma = c.get("soma")
        if not isinstance(soma, list) or not all(isinstance(v, (int, float)) for v in soma):
            R.erro("conferencia_invalida", f"A conferência '{c.get('descricao', '?')}' precisa de 'soma' (lista de números).")
            continue
        total = round(sum(soma), 3)
        desc = c.get("descricao", "conta")
        if "esperado" in c:
            if abs(total - c["esperado"]) > TOL:
                R.erro("conferencia", f"A conta '{desc}' soma {cm(total)}, mas o esperado é {cm(c['esperado'])}. Revise as parcelas ou as peças.")
                continue
        elif "minimo" in c:
            if total < c["minimo"] - TOL:
                R.erro("conferencia", f"A conta '{desc}' dá {cm(total)}, abaixo do mínimo {cm(c['minimo'])}.")
                continue
        elif "maximo" in c:
            if total > c["maximo"] + TOL:
                R.erro("conferencia", f"A conta '{desc}' dá {cm(total)}, acima do máximo {cm(c['maximo'])}.")
                continue
        else:
            R.erro("conferencia_invalida", f"A conferência '{desc}' precisa de 'esperado', 'minimo' ou 'maximo'.")
            continue
        conf_ok += 1
        R.ok(f"{desc}: {cm(total)}")

    # 8. passos
    ids = {p["id"] for p in pecas}
    contagem = {i: 0 for i in ids}
    for n, s in enumerate(proj["passos"], 1):
        for i in s.get("pecas", []):
            if i not in ids:
                R.erro("passo_peca_inexistente", f"O passo {n} ('{s.get('titulo', '')}') cita a peça '{i}', que não existe.")
            else:
                contagem[i] += 1
    for i, q in sorted(contagem.items()):
        if q == 0:
            R.erro("peca_sem_passo", f"A peça {i} não é montada em nenhum passo. Inclua o id dela em 'pecas' do passo onde ela entra.")
        elif q > 1:
            R.erro("peca_passo_repetido", f"A peça {i} aparece em {q} passos. Deixe-a só no passo em que ela é montada.")
    if all(q == 1 for q in contagem.values()):
        R.ok(f"Cada peça é montada em exatamente um passo ({len(proj['passos'])} passos)")
    if not 8 <= len(proj["passos"]) <= 12:
        R.aviso("passos_quantidade", f"O projeto tem {len(proj['passos'])} passos; o padrão é de 8 a 12.")

    # 9. peça solta (nenhuma face encostando em outra)
    for a in pecas:
        toca = False
        for b in pecas:
            if a is b:
                continue
            ext = intersecao(a["caixa"], b["caixa"])
            if all(e >= -TOL for e in ext) and sum(e > TOL for e in ext) >= 2:
                toca = True
                break
        if not toca and len(pecas) > 1:
            R.aviso("peca_solta", f"A peça {a['id']} ({a.get('nome', '')}) não encosta em nenhuma outra. Confira a posição.")

    # 10. lista de corte, plano e chapas
    grupos, itens_por_mat, fita_cm = {}, {}, 0.0
    for p in pecas:
        m = materiais[p["material"]]
        c, l, e, _, girar = medidas_corte(p, m)
        bordas = sorted(p.get("bordas", []))
        f = sum(c if b.startswith("C") else l for b in bordas)
        fita_cm += f
        chave = (p["material"], round(c, 1), round(l, 1), tuple(bordas), girar)
        g = grupos.setdefault(chave, {"ids": [], "nomes": [], "grupo": p.get("grupo", ""), "material": p["material"],
                                      "material_nome": m["nome"], "comprimento": round(c, 1), "largura": round(l, 1),
                                      "espessura_mm": m["espessura_mm"], "veio": "livre" if girar else "no comprimento",
                                      "bordas": bordas, "fita_cm": 0.0})
        g["ids"].append(p["id"])
        if p.get("nome") not in g["nomes"]:
            g["nomes"].append(p.get("nome", ""))
        g["fita_cm"] = round(g["fita_cm"] + f, 1)
        itens_por_mat.setdefault(p["material"], []).append({"id": p["id"], "c": round(c, 1), "l": round(l, 1), "girar": girar})
    lista = sorted(grupos.values(), key=lambda g: g["ids"][0])
    for g in lista:
        g["qtd"] = len(g["ids"])
    calc["lista_corte"] = lista
    calc["fita_total_m"] = round(fita_cm / 100, 2)

    plano, chapas_ok = [], True
    for mid, itens in itens_por_mat.items():
        m = materiais[mid]
        ch = m["chapa"]
        chapas, grandes = empacotar(itens, ch["comprimento"], ch["largura"])
        for g in grandes:
            chapas_ok = False
            R.erro("peca_maior_que_chapa", f"A peça {g['id']} ({cm(g['c'])} × {cm(g['l'])} cm) não cabe na chapa de {cm(ch['comprimento'])} × {cm(ch['largura'])} cm de {m['nome']}, mesmo descontando o refilo. Divida a peça ou troque o material.")
        plano.append({"material": mid, "nome": m["nome"], "chapa": ch, "chapas": chapas})
        compradas = sum(c.get("quantidade", 0) for c in proj["compras"] if c.get("material") == mid)
        if compradas < len(chapas):
            chapas_ok = False
            R.erro("chapa_insuficiente", f"O plano de corte de {m['nome']} usa {len(chapas)} {'tábua(s)' if m.get('tipo') == 'tabua' else 'chapa(s)'}, mas a lista de compras tem {compradas}. Ajuste a quantidade no item de compras com \"material\": \"{mid}\".")
    calc["plano_corte"] = plano
    if chapas_ok:
        R.ok("Chapas da lista de compras bastam: " + ", ".join(f"{len(p['chapas'])} × {p['nome']}" for p in plano))

    fita_comprada = sum(c.get("quantidade", 0) for c in proj["compras"] if c.get("tipo") == "fita_borda")
    if fita_cm > 0 and fita_comprada < fita_cm / 100 * 1.1 - 1e-9:
        R.aviso("fita_insuficiente", f"As bordas somam {cm(fita_cm / 100)} m de fita; com 10% de sobra são {cm(fita_cm / 100 * 1.1)} m, e a lista de compras tem {cm(fita_comprada)} m (item com \"tipo\": \"fita_borda\").")

    calc["status"] = "ok" if not R.erros else "erro"
    return calc


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    pasta = Path(argv[1])
    arq = pasta / "projeto.json"
    try:
        proj = json.loads(arq.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERRO: não encontrei {arq}.")
        return 2
    except json.JSONDecodeError as e:
        print(f"ERRO: {arq} não é um JSON válido (linha {e.lineno}, coluna {e.colno}): {e.msg}.")
        return 2
    calc = validar(proj)
    calc["gerado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (pasta / "calculado.json").write_text(json.dumps(calc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if calc["erros"]:
        print(f"REPROVADO: {len(calc['erros'])} erro(s).")
        for e in calc["erros"]:
            print(f"- [{e['codigo']}] {e['msg']}")
    else:
        print(f"APROVADO: {len(calc['verificacoes'])} verificações passaram.")
    for a in calc["avisos"]:
        print(f"- aviso [{a['codigo']}] {a['msg']}")
    return 0 if not calc["erros"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
