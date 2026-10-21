# Consolidação final da interface — prévia para aprovação

Branch `fix/final-ui-consistency`, criada de `feature/unified-mission-optimization` no commit `e21a142`. **Sem merge na `main` e sem publicação no GitHub Pages.** O motor de cálculo, os coeficientes e a lógica funcional não foram alterados. As capturas abaixo usam um **OFP sintético de 18 waypoints**; seus números são apenas ilustrativos.

## Arquitetura e correções

`styles.css` continua a única folha de produção. Os quatro papéis de texto são atribuídos pela camada visual em `js/layout.js` e definidos uma vez pelos tokens compartilhados. `#payloadOutput` e `#layoutFuelMargin` agora têm os mesmos cinco atributos tipográficos computados. Inputs e selects usam o papel editável de no mínimo 16 px. Campos com unidade desenham uma única borda e têm foco no contêiner.

A grade de Calibração reserva espaço para Posição, FL, combustível, TAS/GPH e ações; no celular ela se torna uma coluna. ICE/RIDE, ETP/PNR e Score mudam de composição quando os valores já não cabem. Não há reticências ou quebra forçada de palavras em dados operacionais. O linter passou a rejeitar compressão tipográfica e truncamento. Da base para esta branch, a folha passou de **841 regras e 2.807 declarações** para **847 regras e 2.738 declarações**: saldo de **69 declarações removidas** e seis regras estruturais adicionadas, sem CSS paralelo.

Arquivos de implementação e verificação: `index.html`, `styles.css`, `js/layout.js`, `scripts/audit-css.mjs`, `scripts/audit-browser.mjs` e `scripts/visual-probe.js`. Evidências e documentação ficam em `review/`. `js/app.js`, `js/engine.js`, `js/config.js` e `js/unified-optimization.js` permanecem sem alterações.

## Tipografia computada

Pilha computada comum: `Inter, system-ui, -apple-system, "system-ui", "Segoe UI", sans-serif`. A tabela mostra exemplos representativos em PT-BR, unidades LB/GAL, tamanho A, a 1440 px. A auditoria compara os mesmos papéis em cada estado testado.

| Componente | Papel | Tamanho | Peso | Entrelinha | Tracking |
| --- | --- | ---: | ---: | ---: | ---: |
| Rótulo de Carga útil / W&B | Label | 12 px | 500 | 16,2 px | 0,48 px |
| `#payloadOutput` | Secundário | 14 px | 600 | 18,9 px | normal |
| `#layoutFuelMargin` | Secundário | 14 px | 600 | 18,9 px | normal |
| `#wbTakeoffCg` | Enfatizado | 16 px | 600 | 21,6 px | normal |
| `#iceModuleIndex` / peso de decolagem | Principal | 24 px | 600 | 28,8 px | normal |

Em EN-US, KG/L e A+, os dois valores secundários permanecem idênticos: **15,82 px / 600 / 21,357 px / tracking normal**. A−/A/A+ foram exercitados em todos os tamanhos de tela; os controles editáveis permanecem com pelo menos 16 px.

## Responsividade e geometria

| Largura | Resultado no Chromium |
| ---: | --- |
| 320, 375, 390, 430 px | Sem texto crítico cortado, colisão ou overflow horizontal; ETP e Score se empilham quando necessário |
| 768 px | Grade de ICE/RIDE em duas colunas; formulário de Calibração alinhado |
| 1024 px | Área técnica usa o espaço sem esticar cards compactos |
| 1440, 1920 px | Conteúdo limitado a 1180 px, cards com altura natural |

O navegador mediu `getBoundingClientRect`, fragmentos de texto com `Range.getClientRects`, `scrollWidth/clientWidth`, `scrollHeight/clientHeight` e estilos computados. Verificou número e unidade, ícone versus rótulo, texto contra a borda do card, áreas recortadas, campos com unidade, foco, alinhamento de formulários e folga da navegação inferior. Quatro defeitos injetados de propósito foram detectados: texto cortado, número separado da unidade, texto fora do card e ícone sobreposto. O teste adicional de viewport efetivo de 720 px cobre o rearranjo esperado em uma janela desktop de 1440 px ampliada a 200%.

## Regressões

| Verificação | Resultado |
| --- | --- |
| `npm test` | 86 aprovados, zero falhas |
| `npm run lint:css` | 847 regras, 2.738 declarações, zero problemas |
| `npm run audit:browser` | 266 estados, zero falhas, 32 capturas |
| Fluxos | OFP sintético importado, navegação das quatro áreas, otimização e aplicação explícita, modos/unidades/idiomas, foco, valores mínimo e máximo, calibração TAS/GPH e persistência local exercitados |

Relatório integral das medições: [browser-audit.json](browser-audit.json). Padrão para futuras telas: [design-system.md](design-system.md).

## Capturas finais

| Tela | Desktop 1440 px | Tablet 768 px | Celular 390 px |
| --- | --- | --- | --- |
| Missão | [Visão geral](final/desktop-mission-overview.png) · [Score](final/desktop-mission-score.png) | [Visão geral](final/tablet-mission-overview.png) · [Score](final/tablet-mission-score.png) | [Visão geral](final/mobile-mission-overview.png) · [Score](final/mobile-mission-score.png) |
| Planejamento → Configuração | [Captura](final/desktop-planning-config.png) | [Captura](final/tablet-planning-config.png) | [Captura](final/mobile-planning-config-full.png) |
| Planejamento → Otimização | [Captura](final/desktop-planning-optimize.png) | [Captura](final/tablet-planning-optimize.png) | [Captura](final/mobile-planning-optimize-full.png) |
| Peso & sistemas | [Captura](final/desktop-planning-systems.png) | [Captura](final/tablet-planning-systems.png) | [Captura](final/mobile-planning-systems-full.png) |
| Rota → ICE | [Captura](final/desktop-route-ice.png) | [Captura](final/tablet-route-ice.png) | [Captura](final/mobile-route-ice-full.png) |
| Rota → RIDE | [Captura](final/desktop-route-ride.png) | [Captura](final/tablet-route-ride.png) | [Captura](final/mobile-route-ride-full.png) |
| Em voo → Calibração | [Captura](final/desktop-flight-calibration.png) | [Captura](final/tablet-flight-calibration.png) | [Captura](final/mobile-flight-calibration-full.png) |

## Comparação dos problemas identificados

| Tela | Antes | Depois |
| --- | --- | --- |
| Configuração desktop | [Captura](final-ui-before/desktop-planning-config.png) | [Captura](final/desktop-planning-config.png) |
| Configuração tablet | [Captura](final-ui-before/tablet-planning-config.png) | [Captura](final/tablet-planning-config.png) |
| Configuração celular | [Captura](final-ui-before/mobile-planning-config.png) | [Captura](final/mobile-planning-config.png) |
| Calibração desktop | [Captura](final-ui-before/desktop-flight-calibration.png) | [Captura](final/desktop-flight-calibration.png) |
| Calibração tablet | [Captura](final-ui-before/tablet-flight-calibration.png) | [Captura](final/tablet-flight-calibration.png) |
| Calibração celular | [Captura](final-ui-before/mobile-flight-calibration.png) | [Captura](final/mobile-flight-calibration.png) |

## Pendências de validação

- Playwright WebKit não está instalado neste ambiente. Safari iOS e aparelhos físicos ainda requerem inspeção manual.
- O cenário de ampliação usa viewport efetivo equivalente e A−/A/A+; o comando de zoom da interface do navegador não foi automatizado.
- O OFP do teste é sintético. A auditoria não verifica a aparência de todos os possíveis dados reais do SimBrief.

Para abrir a prévia navegável desta branch: `npm run serve` e `http://127.0.0.1:4173/`. O arquivo [index.html](../index.html) também pode ser aberto por servidor estático. A versão pública continua na `main` até aprovação visual.
