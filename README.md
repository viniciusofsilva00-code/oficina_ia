# oficina_ia

Projetos de marcenaria a partir de fotos e de uma ideia. Alguém abre uma issue pelo celular com as fotos; o GitHub Actions roda o Claude Code com o **plano Claude do dono do repositório** (sem chave de API), gera o `projeto.json`, valida as medidas e publica a página no GitHub Pages. Um projeto vini_lab.

Para quem vai pedir projetos: [COMO-USAR.md](COMO-USAR.md).

## Como funciona

```
issue (formulário) ──► preparar_pedido.py ──► Claude escreve projeto.json ──► validar_projeto.py (até 5 rodadas)
                                                                                     │
                     comentário na issue com o link ◄── commit + push ◄── atualizar_indice.py
```

- `projeto.json` é a única fonte de verdade. `docs/assets/projeto.js` desenha tudo a partir dele e do `calculado.json`.
- Projeto que não fecha é publicado com o aviso "não corte".
- Comentário começando com `ajuste:` refaz o projeto a partir da versão atual.

## Configuração (só o dono do repositório)

1. **Repositório público.** O Pages gratuito exige. As fotos dos pedidos ficam publicadas na pasta do projeto, sem EXIF (sem GPS).
2. **Token do plano.** No seu computador, com o Claude Code logado na conta do plano:
   ```bash
   claude setup-token
   ```
   Copie o token e crie o secret em *Settings → Secrets and variables → Actions → New repository secret*: nome `CLAUDE_CODE_OAUTH_TOKEN`.
3. **Variáveis** (mesma tela, aba *Variables*):
   - `USUARIOS_PERMITIDOS`: logins do GitHub separados por vírgula, sem espaço (ex.: `seulogin,loginDoPai`). Só eles disparam a geração.
   - `MODELO_CLAUDE` (opcional): `sonnet` (padrão) ou `opus`.
4. **Permissão das Actions:** *Settings → Actions → General → Workflow permissions → Read and write permissions*.
5. **GitHub Pages:** *Settings → Pages → Deploy from a branch → `main` / `docs`*.
6. **Rótulos:** crie `projeto` e `pronto`:
   ```bash
   gh label create projeto --color FF2BD6 --description "Pedido de projeto"
   ```
   ```bash
   gh label create pronto --color 147A3D --description "Projeto publicado"
   ```
7. **Convide quem vai pedir** como colaborador (*Settings → Collaborators*). O `claude-code-action` só roda para quem tem permissão de escrita.

## Limites

- Cada pedido consome a cota do seu plano (cerca de 10 a 40 turnos do modelo). `--max-turns 40` corta o excesso.
- Um projeto por vez (`concurrency`): pedidos simultâneos esperam na fila.
- Num repositório público qualquer pessoa pode abrir issue; o portão `USUARIOS_PERMITIDOS` impede que isso gaste sua cota.
- O token de `claude setup-token` vale por cerca de 1 ano; quando vencer, gere outro e troque o secret.
- O modelo lê as fotos; medida de trena borrada vira premissa. A página sempre pede para conferir antes do corte.

## Desenvolvimento

```bash
python3 -m unittest discover -s tests -v
```
```bash
python3 scripts/validar_projeto.py docs/projetos/001-gabinete-pia-60
```
```bash
python3 tests/capturas.py
```

`tests/capturas.py` precisa de `pip install playwright pillow pillow-heif` e `python -m playwright install chromium`.

## Estrutura

```
.github/ISSUE_TEMPLATE/   formulário do pedido
.github/workflows/        gerar-projeto.yml
scripts/                  preparar_pedido.py · validar_projeto.py · atualizar_indice.py
prompt/                   gerar-projeto.md (contrato do Claude) · ESQUEMA.md (formato do projeto.json)
docs/                     site do Pages: galeria, assets e projetos/<NNN-slug>/
tests/                    validador, preparador e capturas com Playwright
```
