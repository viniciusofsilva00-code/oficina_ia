"""Testes do validador: o projeto-gabarito 000 passa e 7 versões quebradas de propósito são recusadas.

Rodar: python3 -m unittest discover -s tests -v
"""
import copy
import json
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from validar_projeto import validar  # noqa: E402

BASE = json.loads((RAIZ / "docs/projetos/000-gabinete-pia-60/projeto.json").read_text(encoding="utf-8"))


def peca(p, pid):
    return next(x for x in p["pecas"] if x["id"] == pid)


def quebrar(fn):
    p = copy.deepcopy(BASE)
    fn(p)
    return validar(p)


class ProjetoGabarito(unittest.TestCase):
    def test_000_aprovado(self):
        c = validar(copy.deepcopy(BASE))
        self.assertEqual(c["status"], "ok", c["erros"])
        self.assertEqual(len(c["plano_corte"][0]["chapas"]), 1)
        self.assertEqual(c["medidas_reais"], {"largura": 58, "altura": 83, "profundidade": 44})


class CasosQuebrados(unittest.TestCase):
    def assertRecusa(self, calc, codigo):
        codigos = [e["codigo"] for e in calc["erros"]]
        self.assertEqual(calc["status"], "erro")
        self.assertIn(codigo, codigos, f"esperava '{codigo}', veio {codigos}")

    def test_1_sobreposicao(self):
        # porta esquerda empurrada 1 cm para dentro da lateral
        self.assertRecusa(quebrar(lambda p: peca(p, "P1")["caixa"].__setitem__(2, 41.2)), "sobreposicao")

    def test_2_medida_externa(self):
        self.assertRecusa(quebrar(lambda p: p["dimensoes_externas"].__setitem__("largura", 60)), "medida_externa")

    def test_3_folga_invadida(self):
        # travessa da frente recuada para cima da cuba
        self.assertRecusa(quebrar(lambda p: peca(p, "T2")["caixa"].__setitem__(2, 30)), "folga_invadida")

    def test_4_espessura(self):
        self.assertRecusa(quebrar(lambda p: peca(p, "T1")["caixa"].__setitem__(5, 1.5)), "espessura")

    def test_5_peca_sem_passo(self):
        def f(p):
            for s in p["passos"]:
                if "P2" in s["pecas"]:
                    s["pecas"].remove("P2")
        self.assertRecusa(quebrar(f), "peca_sem_passo")

    def test_6_conta_errada(self):
        self.assertRecusa(quebrar(lambda p: p["conferencias"][0].__setitem__("esperado", 59)), "conferencia")

    def test_7_chapa_insuficiente(self):
        # chapa pequena: o plano pede mais chapas do que a lista de compras tem
        self.assertRecusa(quebrar(lambda p: p["materiais"][0].__setitem__("chapa", {"comprimento": 100, "largura": 90})), "chapa_insuficiente")


class MadeiraMacica(unittest.TestCase):
    def test_tabua_entra_no_plano(self):
        p = copy.deepcopy(BASE)
        p["materiais"].append({"id": "cedro18", "nome": "Tábua de cedrinho 1,8 × 30 cm", "tipo": "tabua", "espessura_mm": 18,
                               "chapa": {"comprimento": 300, "largura": 30}, "veio": True})
        for pid in ("T1", "T2"):
            peca(p, pid)["material"] = "cedro18"
            peca(p, pid)["veio"] = "x"
        c = validar(p)
        self.assertIn("chapa_insuficiente", [e["codigo"] for e in c["erros"]])  # falta a tábua na lista de compras
        p["compras"].append({"categoria": "Madeira", "item": "Tábua de cedrinho", "quantidade": 1, "unidade": "tábua", "material": "cedro18"})
        c = validar(p)
        self.assertEqual(c["status"], "ok", c["erros"])
        tabua = next(m for m in c["plano_corte"] if m["material"] == "cedro18")
        self.assertEqual(len(tabua["chapas"]), 1)


class Avisos(unittest.TestCase):
    def test_fita_insuficiente_e_aviso(self):
        def f(p):
            next(c for c in p["compras"] if c.get("tipo") == "fita_borda")["quantidade"] = 3
        c = quebrar(f)
        self.assertEqual(c["status"], "ok")
        self.assertIn("fita_insuficiente", [a["codigo"] for a in c["avisos"]])

    def test_peca_solta_e_aviso(self):
        def f(p):
            peca(p, "T2")["caixa"][1] = 100  # travessa flutuando acima do móvel
            p["folgas"] = []
        c = quebrar(f)
        self.assertIn("peca_solta", [a["codigo"] for a in c["avisos"]])


if __name__ == "__main__":
    unittest.main()
