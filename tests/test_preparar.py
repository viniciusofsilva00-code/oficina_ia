"""Teste do preparador com uma issue falsa: imagem em markdown, em <img> e um comentário de ajuste.

Precisa de Pillow (pip install pillow pillow-heif). Rodar: python3 -m unittest tests.test_preparar -v
"""
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from functools import partial
from pathlib import Path


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


RAIZ = Path(__file__).resolve().parent.parent

try:
    from PIL import Image
    TEM_PIL = True
except ImportError:
    TEM_PIL = False


@unittest.skipUnless(TEM_PIL, "Pillow não instalado")
class PreparadorIssueFalsa(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="oficina-"))
        servir = cls.tmp / "servir"
        servir.mkdir()
        # foto "de celular" deitada: 400×300 com EXIF orientação 6 (girar 90°)
        img = Image.new("RGB", (400, 300), (200, 120, 60))
        exif = Image.Exif()
        exif[0x0112] = 6
        img.save(servir / "trena.jpg", exif=exif)
        Image.new("RGBA", (320, 240), (60, 120, 200, 255)).save(servir / "pia.png")
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
            Image.new("RGB", (200, 100), (90, 90, 90)).save(servir / "foto.heic")
            cls.heic = True
        except Exception:
            cls.heic = False
        handler = partial(Silencioso, directory=str(servir))
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

        heic = f'\n\n![celular]({base}/foto.heic)' if cls.heic else ""
        corpo = (
            "### Ideia\n\nGabinete para a pia do banheiro, com duas portas.\n\n"
            f"### Fotos\n\n![trena na pia]({base}/trena.jpg)\n\n<img width=\"300\" alt=\"pia\" src=\"{base}/pia.png\" />{heic}\n\n"
            "### Medidas que você já sabe\n\nPia 60 x 45 cm\n\n"
            "### Onde o móvel vai ficar\n\nBanheiro social\n\n"
            "### Material\n\nMDF RU (resistente à umidade)\n\n"
            "### Extras\n\n_No response_\n"
        )
        evento = {"action": "created",
                  "issue": {"number": 7, "title": "[projeto] Gabinete da pia do banheiro", "body": corpo, "created_at": "2026-10-25T12:00:00Z"},
                  "comment": {"body": "ajuste: altura final de 80 cm", "user": {"login": "pai"}}}
        comentarios = [
            {"body": "Recebi o pedido.", "user": {"login": "github-actions[bot]"}, "created_at": "2026-10-25T12:01:00Z"},
            {"body": "ajuste: altura final de 80 cm", "user": {"login": "pai"}, "created_at": "2026-10-25T13:00:00Z"},
            {"body": "ajuste: faz de ouro", "user": {"login": "estranho"}, "created_at": "2026-10-25T13:05:00Z"},
        ]
        cls.raiz = cls.tmp / "repo"
        (cls.raiz / "docs" / "projetos").mkdir(parents=True)
        (cls.tmp / "evento.json").write_text(json.dumps(evento), encoding="utf-8")
        (cls.tmp / "coment.json").write_text(json.dumps(comentarios), encoding="utf-8")
        env = dict(os.environ, USUARIOS_PERMITIDOS="vinicius, pai", GITHUB_OUTPUT=str(cls.tmp / "out.txt"))
        env.pop("GITHUB_TOKEN", None)
        cls.res = subprocess.run([sys.executable, str(RAIZ / "scripts/preparar_pedido.py"), "--evento", str(cls.tmp / "evento.json"),
                                  "--comentarios", str(cls.tmp / "coment.json"), "--raiz", str(cls.raiz)],
                                 capture_output=True, text=True, env=env, timeout=60)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_roda_sem_erro(self):
        self.assertEqual(self.res.returncode, 0, self.res.stderr)

    def test_id_e_saidas(self):
        meta = json.loads((self.raiz / "work/meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["id"], "007-gabinete-da-pia-do-banheiro")
        self.assertEqual(meta["modo"], "novo")  # ajuste sem projeto.json vira projeto novo
        out = (self.tmp / "out.txt").read_text()
        self.assertIn("pasta=docs/projetos/007-gabinete-da-pia-do-banheiro", out)

    def test_fotos_nos_dois_tamanhos(self):
        esperadas = 3 if self.heic else 2
        claude = sorted((self.raiz / "work/fotos").glob("*.jpg"))
        publico = sorted((self.raiz / "docs/projetos/007-gabinete-da-pia-do-banheiro/fotos").glob("*.jpg"))
        self.assertEqual(len(claude), esperadas)
        self.assertEqual(len(publico), esperadas)
        # orientação EXIF aplicada: 400×300 deitada vira 300×400 em pé, e o EXIF sai do arquivo
        im = Image.open(claude[0])
        self.assertEqual(im.size, (300, 400))
        self.assertNotIn(0x0112, im.getexif())

    def test_pedido_md(self):
        md = (self.raiz / "work/pedido.md").read_text(encoding="utf-8")
        self.assertIn("Gabinete para a pia do banheiro", md)
        self.assertIn("Pia 60 x 45 cm", md)
        self.assertIn("work/fotos/foto-01.jpg", md)
        self.assertIn("altura final de 80 cm", md)
        self.assertNotIn("de ouro", md)          # comentário de quem não está na lista
        self.assertIn("(não informado)", md)      # Extras = _No response_

    def test_reaproveita_pasta_existente(self):
        pasta = self.raiz / "docs/projetos/007-nome-antigo"
        pasta.mkdir()
        (pasta / "projeto.json").write_text("{}", encoding="utf-8")
        try:
            env = dict(os.environ, USUARIOS_PERMITIDOS="pai")
            env.pop("GITHUB_OUTPUT", None)
            env.pop("GITHUB_TOKEN", None)
            r = subprocess.run([sys.executable, str(RAIZ / "scripts/preparar_pedido.py"), "--evento", str(self.tmp / "evento.json"),
                                "--comentarios", str(self.tmp / "coment.json"), "--raiz", str(self.raiz)],
                               capture_output=True, text=True, env=env, timeout=60)
            meta = json.loads(r.stdout.strip().splitlines()[-1])
            self.assertEqual(meta["id"], "007-nome-antigo")
            self.assertEqual(meta["modo"], "ajuste")
        finally:
            shutil.rmtree(pasta)


if __name__ == "__main__":
    unittest.main()
