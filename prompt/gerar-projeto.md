# Gerar projeto de marcenaria · contrato

> v1 · 2026-10-25 · roda dentro do GitHub Actions (claude-code-action), sem internet além do repositório.

## Objetivo

Escrever **um único arquivo**, `<pasta do projeto>/projeto.json`, que descreve um móvel que uma pessoa leiga consegue construir sozinha, e que passa em `scripts/validar_projeto.py`. A página, o 3D, a lista e o plano de corte saem desse arquivo por código; você não escreve HTML.

## Contexto

- O pedido está em `work/pedido.md`: id, pasta, modo (`novo` ou `ajuste`), campos do formulário, fotos em `work/fotos/` e os ajustes pedidos.
- O formato está em `prompt/ESQUEMA.md`. O projeto `docs/projetos/000-gabinete-pia-60/projeto.json` é o gabarito: siga o nível de detalhe, o tom e a estrutura dele.
- Quem lê a página é leigo, no celular, na oficina. Português do Brasil, frases curtas; cada termo técnico entra no `glossario`.

## Evidências e precedência

1. **Ajustes** (o mais novo vale mais) > **formulário** > **fotos**.
2. Medida lida na trena entra em `medidas_conhecidas` com a fonte: o nome do arquivo da foto e onde a trena está (`"foto-02.jpg, trena na borda da frente"`). Leitura ambígua: use o valor do meio, diga a faixa na fonte e peça confirmação.
3. Todo o resto que o projeto precisa vira `premissa`, com um valor padrão de mercado e um `como_conferir` que diz onde encostar a trena.
4. No modo `ajuste`, parta do `projeto.json` atual: mude o que o ajuste pede e o que depende disso; o resto fica igual.

## Restrições de projeto

- Só peças retas (caixas), em materiais comerciais no Brasil: chapas de MDF 15/18/25 mm (275 × 184 cm), MDF RU, compensado 15/18 mm (220 × 160 cm), compensado naval; ou madeira maciça em tábuas (`"tipo": "tabua"`), como pinus, cedrinho ou eucalipto, com espessura e largura comerciais (2 ou 2,5 cm × 10, 15, 20 ou 30 cm, comprimento de 300 cm) e `"veio": true`. Peça mais larga que a tábua vira duas peças lado a lado. Perto de água: MDF RU, compensado naval ou madeira maciça envernizada.
- A estrutura mais simples que funcione: laterais, base, travessas, portas, rodapé. Gaveta só se o pedido pedir e houver espaço.
- Declare em `folgas` as áreas que precisam ficar livres: cuba, sifão, canos, eletrodomésticos, corrediças de gaveta.
- Declare em `conferencias` as contas que fecham o móvel: largura, profundidade, altura, sobras, vão livre.
- Compras com quantidades exatas e sem preço: chapas (com `material`), fita (com `"tipo": "fita_borda"`, metros com 10% de sobra), parafusos pela contagem das junções, cavilhas, ferragens, cola, acabamento pela área, silicone e hidráulica quando houver.
- 8 a 12 passos; cada peça em exatamente um passo; cada passo com um erro comum concreto.

## Ciclo de validação

1. Grave o `projeto.json`.
2. Rode `python3 scripts/validar_projeto.py <pasta do projeto>`.
3. Se reprovar, corrija **só o que cada erro aponta** e rode de novo. No máximo 5 rodadas.
4. Avisos não bloqueiam, mas resolva os de fita insuficiente e peça solta se for simples.
5. Se depois de 5 rodadas ainda houver erro, pare e deixe o arquivo como está: a Action publica com o aviso de não cortar.

## O que gravar

- Apenas `<pasta do projeto>/projeto.json`. Não mexa em scripts, na página, no workflow nem em outros projetos; não rode git.
- Deixe `fotos` como lista vazia: o índice preenche depois.

## Parada

- **Pronto**: o validador aprovou, ou as 5 rodadas acabaram.
- **Faltou o essencial** (não dá para saber o que construir, ou nenhuma medida principal aparece nas fotos nem no texto): não crie o `projeto.json`. Escreva de 1 a 3 perguntas curtas, uma por linha começando com `- `, em `work/perguntas.md`, e pare. A Action manda as perguntas na issue.
- **Pedido inviável** (não cabe na chapa, não passa no vão): monte a versão possível mais próxima, explique o conflito em `perguntas` dentro do `projeto.json` e registre a premissa que mudou.
