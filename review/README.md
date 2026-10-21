# Auditoria visual final — branch `visual-css-consolidation`

A prévia navegável fica em `http://127.0.0.1:4173/` após executar `npm run serve` nesta branch. A versão pública na `main` permanece intacta até a aprovação visual. As capturas usam o **mesmo OFP sintético de 18 waypoints** nas duas versões; os números exibidos são apenas dados ilustrativos de teste, sem chamada ao SimBrief.

## Antes e depois da limpeza

| Área | Desktop 1440 px | Tablet 768 px | Celular 390 px |
| --- | --- | --- | --- |
| Missão | [Antes](baseline/desktop-mission-overview.png) · [Depois](final/desktop-mission-overview.png) | [Antes](baseline/tablet-mission-overview.png) · [Depois](final/tablet-mission-overview.png) | [Antes](baseline/mobile-mission-overview.png) · [Depois](final/mobile-mission-overview.png) |
| Planejamento | [Antes](baseline/desktop-planning-config.png) · [Depois](final/desktop-planning-config.png) | [Antes](baseline/tablet-planning-config.png) · [Depois](final/tablet-planning-config.png) | [Antes](baseline/mobile-planning-config.png) · [Depois](final/mobile-planning-config.png) · [Tela inteira](final/mobile-planning-config-full.png) |
| Rota & riscos | [Antes](baseline/desktop-route-matrix.png) · [Depois](final/desktop-route-matrix.png) | [Antes](baseline/tablet-route-matrix.png) · [Depois](final/tablet-route-matrix.png) | [Antes](baseline/mobile-route-matrix.png) · [Depois](final/mobile-route-matrix.png) · [Tela inteira](final/mobile-route-matrix-full.png) |
| Em voo | [Antes](baseline/desktop-flight-calibration.png) · [Depois](final/desktop-flight-calibration.png) | [Antes](baseline/tablet-flight-calibration.png) · [Depois](final/tablet-flight-calibration.png) | [Antes](baseline/mobile-flight-calibration.png) · [Depois](final/mobile-flight-calibration.png) · [Tela inteira](final/mobile-flight-calibration-full.png) |

Outros estados: [sem OFP](final/desktop-no-ofp.png), [Histórico no desktop](final/desktop-flight-history.png), [Histórico no celular](final/mobile-flight-history-full.png) e [aviso longo](final/mobile-long-alert.png).

## Arquitetura e medidas

`styles.css` continua sendo a única folha carregada, organizada em **Tokens → Base → Layout → Componentes → Módulos → Responsividade**. As regras compartilhadas de card, campo e botão estão centralizadas; os estilos especializados ficam nos módulos. Os sete breakpoints de largura são agrupados em um bloco cada; há um oitavo bloco para movimento reduzido.

| Medida por PostCSS | Antes desta auditoria | Depois |
| --- | ---: | ---: |
| Regras | 1.434 | 1.223 |
| Declarações | 4.652 | 3.952 |
| Erros detectados pelo lint | 153 no primeiro passe | 0 |

Comparando o CSS anterior com o final por seletor e contexto de mídia, **213 blocos de regra antigos foram eliminados ou consolidados** (redução líquida de 211). Eles continham 630 declarações. Outras **86 declarações redundantes ou ineficazes** saíram de regras que permaneceram; oito declarações foram adicionadas ou reescritas ao consolidar componentes. Foram retirados quatro tokens sem função na arquitetura final: `--radius`, `--shadow`, `--focus-ring` e `--ice-blue`. Dois escritores de variáveis visuais sem consumidor (`--ice-status` e `--topbar-height`) foram removidos de `js/app.js`, sem tocar nos cálculos.

Conflitos corrigidos: margem anulada em `.kpi-grid`, propriedade Flex em `.kpi` Grid, padding antigo da topbar, borda inexistente em `.brand-mark`, atalhos de fonte parcialmente sobrescritos, cores de estado do KPI anuladas por uma regra posterior, propriedades Grid em contêineres `display: block`, dimensões antigas de RIDE e estilos dos gráficos anteriores de terreno, rota e cenários. O botão antigo de atualização permanece oculto apenas para preservar sua marcação e os handlers existentes; a navegação visível é **Calibração** e **Histórico**.

Sobreposições intencionais mantidas:

- `[hidden]` prevalece sobre `display` dos módulos para que a navegação mostre apenas o painel ativo.
- Variantes de cor de `.kpi.featured` e de estados de missão representam avaliações diferentes.
- Breakpoints alteram grades e medidas dos mesmos componentes conforme a largura disponível.
- `border: 0` seguido de `border-top` ou `border-bottom` em controles específicos estabelece somente a borda desejada.
- `--score` e `--score-color` continuam escritos por JavaScript porque alimentam o indicador circular.

## Verificação reproduzível

1. `npm ci`
2. `npm test` — executa primeiro `scripts/audit-css.mjs` com PostCSS e depois a suíte existente.
3. `npx playwright install chromium`
4. `npm run audit:browser` — inicia um servidor local, intercepta somente o OFP sintético no navegador, percorre as oito larguras e grava [medidas e evidências por estado](browser-audit.json) e as capturas em `review/final/`.

Para reproduzir as capturas da versão anterior, extraia o commit `e4527fc` em uma pasta separada e execute `node scripts/audit-browser.mjs --baseline /caminho/da/pasta`. O comando grava `review/baseline/` e [seu registro](baseline-browser-audit.json).

Resultado final: **129 testes passaram**; **331 estados de navegador** em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px, sem falhas de layout nos critérios medidos. Foram exercitados PT-BR/EN-US, LB/KG, GAL/L, A−/A/A+, foco, ausência e presença de OFP, custo preenchido, histórico com voo registrado, aviso longo e todos os módulos. O teste registra geometria de controles, alinhamento, navegação, tipografia principal e overflow horizontal. O lint verifica referências de seletores no HTML e em todos os scripts, inclusive classes e variáveis geradas dinamicamente.

Limites desta auditoria: as capturas e medidas foram feitas no Chromium 141 automatizado, não em aparelhos físicos ou Safari iOS. Estados raros de risco dependentes de um OFP real não foram todos reproduzidos; suas regras com referências no código foram preservadas. A `main` e o GitHub Pages público não foram alterados.
