# Velocity XL — reconstrução visual e quality gate

Branch de revisão: `fix/definitive-ui-quality`, criada a partir de `fix/final-ui-consistency` (`3bf46a9`). A `main` e o GitHub Pages não foram alterados. O OFP usado nas capturas é **sintético**, com 18 waypoints; os números são ilustrativos.

## Arquitetura implementada

`styles.css` continua a única folha de produção. `index.html` identifica os campos compartilhados e `js/layout.js` aplica classes de componentes também aos elementos movidos ou gerados após a importação. As regras dos módulos definem composição, cor e visualização aeronáutica; a geometria de controles e cards tem uma definição comum.

| Componente | Contrato |
| --- | --- |
| Field, TextInput, NumberInput, SelectField | `.ui-field`; label 12 px, texto editável 16 px, controle de 44 px, borda de 1 px e raio de 10 px. A seta dos selects é compartilhada. |
| UnitInput | `.ui-unit-input`; borda externa de 44 px, valor e unidade no mesmo campo, input interno sem segunda borda. Seus 42 px internos cabem nos 44 px externos. |
| Button | `.ui-button`; altura mínima 44 px, padding e raio comuns; cores primary e outline são variantes. |
| Metric | `.ui-metric`; label, valor e unidade agrupados, com algarismos tabulares. |
| Card | `.ui-card`; variantes compact, summary e technical. O conteúdo determina a altura de resumos e painéis técnicos. |
| Status | `.ui-status`; tipografia comum, com cores semânticas específicas de cada avaliação. |

As exceções de largura em `inline-select` e na reserva mantêm a composição horizontal dessas duas linhas; a altura, borda, raio e tipografia continuam compartilhados. Os KPIs compactos têm altura mínima de 112 px para acomodar suas três linhas. Em telas de até 360 px, a navegação interna passa a duas colunas para preservar palavras inteiras.

Foram removidas as alturas locais de 34, 36 e 38 px em potência, W&B e CUSTO, além da linha de Grid de 38 px que deixava o símbolo `R$` sobre o painel seguinte. O par Mission Score/Ajuste principal agora mede 255 px em ambos os cards a 1440 px, com o ajuste ocupando o espaço por sua própria estrutura. A folha passou de **847 regras / 2.738 declarações** para **834 regras / 2.617 declarações**: menos 13 regras e 121 declarações.

## Medidas computadas

Exemplos do Chromium a 1440 px, PT-BR, LB/GAL, fonte A:

| Par verificado | Topo | Base | Altura | Borda / raio | Texto |
| --- | ---: | ---: | ---: | --- | --- |
| CUSTO: moeda e preço por litro | 488 px | 532 px | 44 px cada | 1 px / 10 px | 16 px, peso 600, entrelinha 20 px |
| Em voo: Posição, FL e combustível | 489 px | 533 px | 44 px cada | 1 px / 10 px | 16 px, peso 600, entrelinha 20 px |
| Em voo: TAS, Fuel Flow e ações | 641 px | 685 px | 44 px cada | 1 px / 10 px | Campos editáveis 16 px |
| Missão: Score e Ajuste principal | 579 px | 834 px | 255 px cada | 1 px / 15 px | Padding 16 px |

Os papéis semânticos usam a mesma família Inter: label **12 px / 500 / 16,2 px**, valor secundário **14 px / 600 / 18,9 px**, valor enfatizado **16 px / 600 / 21,6 px** e valor principal **24 px / 600 / 28,8 px**. `#payloadOutput` e `#layoutFuelMargin` têm a mesma assinatura tipográfica computada. Peso de decolagem, custo principal, índice ICE, ETP/PNR e calibração foram incluídos na auditoria de papéis. A ampliação A+ mantém campos editáveis legíveis.

## Capturas reais

Todas são capturas do Chromium, sem montagem. A navegação inferior fixa aparece no meio das capturas de página inteira do celular porque essas imagens incluem conteúdo além do viewport; a [captura com a Calibração rolada até o fim](definitive-after/mobile-flight-calibration-bottom.png) mostra os botões acessíveis acima da navegação.

| Tela | Desktop 1440 px | Tablet 768 px | Celular 390 px |
| --- | --- | --- | --- |
| Missão | [Visão geral](definitive-after/desktop-mission-overview.png) | [Visão geral](definitive-after/tablet-mission-overview.png) | [Visão geral](definitive-after/mobile-mission-overview.png) |
| Planejamento → Configuração | [Captura](definitive-after/desktop-planning-config.png) | [Captura](definitive-after/tablet-planning-config.png) | [Página inteira](definitive-after/mobile-planning-config-full.png) |
| Planejamento → Otimização | [Captura](definitive-after/desktop-planning-optimize.png) | [Captura](definitive-after/tablet-planning-optimize.png) | [Página inteira](definitive-after/mobile-planning-optimize-full.png) |
| Planejamento → CUSTO | [Com preço](definitive-after/desktop-planning-cost.png) | [Com preço](definitive-after/tablet-planning-cost.png) | [Página inteira](definitive-after/mobile-planning-cost-full.png) |
| Peso & sistemas | [W&B](definitive-after/desktop-planning-systems.png) | [W&B](definitive-after/tablet-planning-systems.png) | [Página inteira](definitive-after/mobile-planning-systems-full.png) |
| Rota → ICE | [Captura](definitive-after/desktop-route-ice.png) | [Captura](definitive-after/tablet-route-ice.png) | [Página inteira](definitive-after/mobile-route-ice-full.png) |
| Rota → RIDE | [Captura](definitive-after/desktop-route-ride.png) | [Captura](definitive-after/tablet-route-ride.png) | [Página inteira](definitive-after/mobile-route-ride-full.png) |
| Em voo → Calibração | [Captura](definitive-after/desktop-flight-calibration.png) | [Captura](definitive-after/tablet-flight-calibration.png) | [Página inteira](definitive-after/mobile-flight-calibration-full.png) |

Comparações diretas dos defeitos conhecidos:

| Defeito | Antes (`3bf46a9`) | Depois |
| --- | --- | --- |
| `R$` intercepta o painel de CUSTO, desktop | [Captura](definitive-before/desktop-planning-cost-unassessed.png) | [Captura](definitive-after/desktop-planning-cost-unassessed.png) |
| `R$` intercepta o painel de CUSTO, celular | [Captura](definitive-before/mobile-planning-cost-unassessed.png) | [Captura](definitive-after/mobile-planning-cost-unassessed.png) |
| Calibração com controles de aparência divergente | [Desktop](definitive-before/desktop-flight-calibration.png) · [Celular](definitive-before/mobile-flight-calibration-full.png) | [Desktop](definitive-after/desktop-flight-calibration.png) · [Celular](definitive-after/mobile-flight-calibration-full.png) |
| Configuração e cards da missão | [Tablet](definitive-before/tablet-planning-config.png) · [Missão](definitive-before/desktop-mission-overview.png) | [Tablet](definitive-after/tablet-planning-config.png) · [Missão](definitive-after/desktop-mission-overview.png) |

## Verificação

| Verificação | Resultado |
| --- | --- |
| `npm test` | 87 testes aprovados; motor e otimização sem alterações |
| `npm run lint:css` | 834 regras, 2.617 declarações, zero problemas |
| `npm run audit:browser` | 334 estados, zero falhas, 41 capturas reais |
| Testes negativos | 10 de 10 defeitos deliberados detectados |
| Navegador | Chromium 141.0.7390.37 |

A auditoria usa `getBoundingClientRect()` na borda visível dos controles, estilos computados, `Range.getClientRects()` para textos, comparação de irmãos e pares de cards, clipping, foco e largura total. As mutações negativas cobrem select de 38 px, trilha Grid de 38 px, símbolo monetário sobre o painel, ícone sobre texto, número separado da unidade, truncamento, cards desiguais, tipografia secundária divergente, texto fora do botão e overflow estreito. Os dados completos estão em [definitive-browser-audit.json](definitive-browser-audit.json).

Foram verificados 320, 375, 390, 430, 768, 1024, 1440 e 1920 px; PT-BR/EN-US; LB/KG; GAL/L; A−/A/A+; ECON/NORMAL/FAST; preço BRL/USD; OFP ausente/importado; foco, desabilitação, valores extremos, alerta longo e resultados extensos. Os estados MARGINAL e INVIÁVEL foram exercitados como mutações **apenas visuais de teste** em 390 e 1440 px, sem modificar o cálculo.

**Limites da validação:** WebKit do Playwright não está instalado neste ambiente; Safari, iOS e Android físicos não foram testados. Os tamanhos desktop, tablet e celular são viewports reais do Chromium, não capturas de dispositivos físicos. O OFP e as condições meteorológicas da auditoria são sintéticos; resultados para todos os possíveis dados reais do SimBrief permanecem fora desta evidência.

A prévia navegável pode ser aberta no servidor local com `npm run serve` em `http://127.0.0.1:4173/`. A aprovação visual é necessária antes de qualquer integração à `main`.
