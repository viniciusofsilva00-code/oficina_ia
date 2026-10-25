# Esquema do `projeto.json`

Um arquivo por projeto, em `docs/projetos/<NNN-slug>/projeto.json`. É a única fonte de verdade: a página, o 3D, a lista de corte, o plano de corte e as ilustrações saem dele. Medidas em **centímetros** (número, ponto decimal), espessura do material em **milímetros**.

## Geometria

- Cada peça é uma caixa `[x, y, z, largura, altura, profundidade]`.
- Origem no **canto de trás, à esquerda, no chão**. `x` cresce para a direita, `y` para cima, `z` da parede para a frente.
- A menor das três medidas da caixa é a espessura e tem que ser igual à `espessura_mm` do material ÷ 10.
- Peças podem se tocar pela face; não podem ocupar o mesmo volume.

## Campos

```jsonc
{
  "versao": 1,
  "id": "001-gabinete-pia-60",            // igual ao nome da pasta
  "titulo": "Gabinete da pia 60",
  "resumo": "Uma ou duas frases sobre o móvel.",
  "pedido_original": "Texto da ideia como veio no formulário.",
  "data": "2026-10-25",
  "dificuldade": 2,                        // 1 a 5
  "tempo": "2 fins de semana · cerca de 10 h + secagem",
  "dimensoes_externas": {"largura": 58, "altura": 83, "profundidade": 44},

  "medidas_conhecidas": [                  // o que foi medido; a fonte é obrigatória
    {"nome": "Largura da pia", "valor": 60, "unidade": "cm", "fonte": "foto-01.jpg, trena na borda da frente"}
  ],
  "premissas": [                           // o que foi estimado
    {"nome": "Fundo da cuba abaixo do tampo", "valor": 18, "unidade": "cm",
     "como_conferir": "Régua sobre a pia; meça até o ponto mais baixo da cuba por fora."}
  ],
  "perguntas": [],                         // dúvidas que não impediram o projeto

  "conferencias": [                        // contas que o validador refaz
    {"descricao": "Largura: laterais + base", "soma": [1.8, 54.4, 1.8], "esperado": 58},
    {"descricao": "Altura livre ≥ cuba + 15", "soma": [83, -8.8], "minimo": 33}   // ou "maximo"
  ],

  "materiais": [
    {"id": "mdf18", "nome": "MDF RU 18 mm", "tipo": "chapa", "espessura_mm": 18,
     "chapa": {"comprimento": 275, "largura": 184}, "veio": false}   // veio=true: compensado, madeira
  ],

  "pecas": [
    {"id": "L1", "nome": "Lateral esquerda", "grupo": "Corpo", "material": "mdf18",
     "caixa": [0, 0, 0, 1.8, 83, 42.2],
     "veio": "y",                          // eixo do veio: "x", "y", "z" ou "livre" (pode girar no corte)
     "bordas": ["C1"],                     // fita: C1, C2 = bordas do comprimento; L1, L2 = bordas da largura
     "obs": "Fita na borda da frente."}
  ],

  "referencias": [                         // só para o 3D; não entram em corte nem em verificação
    {"id": "pia", "nome": "Tampo da pia", "tipo": "caixa", "caixa": [-1, 83, 0, 60, 2, 45]},
    {"id": "cuba", "nome": "Cuba", "tipo": "cuba", "caixa": [6, 67, 7, 46, 16, 32]},     // meia-elipse; boca no topo da caixa
    {"id": "torneira", "nome": "Torneira", "tipo": "cilindro", "eixo": "y", "caixa": [5.5, 85, 5.5, 3, 14, 3]}
  ],

  "folgas": [                              // volumes que nenhuma peça pode invadir
    {"id": "f-cuba", "nome": "Espaço da cuba", "caixa": [6, 67, 7, 46, 16, 32]}
  ],

  "compras": [
    {"categoria": "Chapas", "item": "MDF RU 18 mm 275 × 184 cm", "quantidade": 1, "unidade": "chapa", "material": "mdf18"},
    {"categoria": "Acabamento", "item": "Fita de borda PVC 22 mm", "quantidade": 8, "unidade": "m", "tipo": "fita_borda"},
    {"categoria": "Ferragens", "item": "Parafuso 4,0 × 40 mm", "quantidade": 40, "unidade": "un", "obs": "34 usados"}
  ],
  "ferramentas": [{"nome": "Parafusadeira", "uso": "Montagem e pré-furos"}],

  "passos": [                              // cada peça aparece em exatamente um passo
    {"titulo": "Monte o rodapé", "pecas": ["R1", "R2", "B1"], "texto": "O que fazer, em frases curtas.", "erro_comum": "O erro que mais acontece aqui."}
  ],
  "acabamento": [{"titulo": "Verniz", "texto": "..."}],
  "instalacao": [{"titulo": "Fixar a pia", "texto": "..."}],
  "checklist": ["O móvel está no nível nos dois sentidos."],
  "glossario": [{"termo": "Cavilha", "definicao": "Pino de madeira que alinha e reforça a junção."}],
  "fotos": []                              // preenchido por scripts/atualizar_indice.py
}
```

## Regras

- `id` de peças, referências e folgas são únicos.
- `material` de cada peça existe em `materiais`; toda chapa usada tem um item em `compras` com `"material"` apontando para ela e quantidade suficiente para o plano de corte.
- `dimensoes_externas` = caixa envolvente das peças (referências ficam fora da conta).
- Textos em português do Brasil, frases curtas; termos técnicos entram no `glossario`.
- `texto` aceita parágrafos separados por linha em branco e listas com `- ` no começo da linha.

## Saída do validador: `calculado.json`

Gerado por `scripts/validar_projeto.py` na mesma pasta: `status` (`ok` ou `erro`), `erros`, `avisos`, `medidas_reais`, `lista_corte` (agrupada), `plano_corte` (por material), `fita_total_m`, `verificacoes`. Não edite à mão.
