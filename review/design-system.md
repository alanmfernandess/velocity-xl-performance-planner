# Velocity XL — padrão visual

Esta especificação rege novas telas do aplicativo. A única folha de produção é `styles.css`, organizada em tokens, base, layout, componentes, módulos e responsividade. `js/layout.js` atribui `data-ui-role` e classes de componentes aos elementos estáticos e aos resultados gerados pelo aplicativo. As classes do módulo definem composição e cor operacional; a geometria comum pertence às classes de componentes.

## Papéis e tokens

| Papel | Token | Peso | Entrelinha | Uso |
| --- | --- | ---: | ---: | --- |
| Label | `--ui-caption` (12 px) | 500 | 1,35 | Títulos de campo e legenda curta |
| Valor secundário | `--ui-body` (14 px) | 600 | 1,35 | Leituras de configuração e margens |
| Valor enfatizado | `--ui-title` (16 px) | 600 | 1,35 | Valores de painéis técnicos |
| Valor principal | `--ui-display` (24 px) | 600 | 1,20 | KPIs e índice principal |
| Controle editável | `--ui-control` (mínimo 16 px) | 600 | 1,25 | Inputs e selects, inclusive no iOS |

Todas as funções usam a mesma pilha `--font-family`. Os controles A−/A/A+ alteram `--ui-scale`; o texto editável não cai abaixo de 16 px. Valores usam algarismos tabulares. `font-family`, tamanho, peso, entrelinha e tracking são definidos pelo papel e verificados após a cascata do navegador.

## Geometria

- Escala de espaçamento: `--space-1` a `--space-6`, em múltiplos de 4 px. Controles interativos: altura mínima `--control-height` de 44 px; borda, raio e foco consistentes.
- `Field` (`.ui-field`) contém label e um `TextInput`, `NumberInput`, `SelectField` ou `UnitInput`. Inputs e selects têm 44 px; o `SelectField` usa a mesma seta e geometria em todos os módulos. `UnitInput` (`.ui-unit-input`) desenha uma só borda externa de 44 px; o input interno tem 42 px e não altera a linha da grade. A indicação de foco fica na borda externa.
- `Button` (`.ui-button`) centraliza altura, raio, padding e texto. `.primary-button` e `.text-button` definem apenas a variante de superfície e estado.
- `Card` (`.ui-card`) centraliza superfície e padding; variantes compacta, resumo e técnica usam o conteúdo para determinar altura. `Metric` (`.ui-metric`) agrupa label, leitura e unidade. `Status` (`.ui-status`) centraliza a base tipográfica dos estados.
- Card compacto: altura natural, label e valor próximos. Card de resumo: linhas relacionadas, sem altura artificial. Painel técnico: grade adaptativa para formulário, tabela ou gráfico.
- Ícone e rótulo usam `inline-flex` com gap; SVG não participa do texto. Controles de uma linha só exigem espaço suficiente para o conteúdo; caso contrário a grade muda de colunas.
- Número e unidade permanecem na mesma linha. Frases podem quebrar entre palavras; não se quebram palavras nem se usam reticências para dados operacionais. Dados longos em faixas de rota usam rolagem horizontal intencional dentro da faixa.

## Responsividade

O conteúdo geral ocupa no máximo 1180 px. As grades passam a uma ou duas colunas conforme a largura útil: 900 px equilibra os quatro indicadores ICE/RIDE em 2 × 2; 760 px ativa navegação inferior e uma coluna para painéis técnicos; 360 px reduz a navegação interna de três para duas colunas e empilha o score e ETP/PNR. A barra inferior respeita `safe-area-inset-bottom`; o corpo reserva espaço para que o último conteúdo permaneça acessível. A ampliação por gesto permanece habilitada.

Exceções: gráficos, medidores e faixas da rota podem recortar ou rolar apenas sua geometria visual. Textos críticos não usam `text-overflow: ellipsis`, `overflow-wrap: anywhere`, `word-break: break-all`, `zoom` ou tracking negativo.

Execute `npm test` e `npm run audit:browser` após alterar componentes compartilhados. A auditoria mede a borda visível dos controles, estilos computados, pares de cards, linhas, foco, colisões entre irmãos, clipping e oito larguras de viewport. Dez mutações deliberadas exercitam seus detectores. A execução atual está em [definitive-ui-report.md](definitive-ui-report.md).
