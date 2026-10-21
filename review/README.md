# Revisão visual — branch `visual-css-consolidation`

Prévia navegável local: execute `npm run serve` nesta branch e abra `http://127.0.0.1:4173/`. O OFP carregado nas capturas é o KSEA → CYBD; os dados de voo não são parte da refatoração. A versão pública na branch principal permanece inalterada até aprovação visual.

## Comparação

| Tela | Antes | Depois |
| --- | --- | --- |
| Missão, 1440 px | [Captura](before/desktop-mission.png) | [Captura](after/desktop-mission.png) |
| Planejamento, 1440 px | [Captura](before/desktop-planning.png) | [Captura](after/desktop-planning.png) |
| Histórico, 1440 px | [Captura](before/desktop-flight-history.png) | [Captura](after/desktop-flight-history.png) |
| Planejamento, 768 px | [Captura](before/tablet-planning.png) | [Captura](after/tablet-planning.png) |
| Matriz, 768 px | [Captura](before/tablet-route-matrix.png) | [Captura](after/tablet-route-matrix.png) |
| Missão, 390 px | [Captura](before/mobile-mission.png) | [Captura](after/mobile-mission.png) |
| Matriz, 390 px | [Captura](before/mobile-route-matrix.png) | [Captura](after/mobile-route-matrix.png) |

Outros estados: [Histórico no celular](after/mobile-flight-history.png), [sem OFP](after/desktop-no-ofp.png) e [aviso longo](after/mobile-long-alert.png).

## Arquitetura

`styles.css` é a única folha carregada. Suas seções são **Tokens, Base, Layout, Componentes, Módulos e Responsividade**. A escala tipográfica é 12/14/16/24 px, controlada por `--ui-scale`; controles de toque usam `--control-height: 44px`. Os estilos especializados de matrizes, gráficos e instrumentos permanecem no bloco de módulos. Cada breakpoint aparece em um único bloco de media query.

O antigo `design-system.css` foi removido. As regras globais de tipografia com `!important`, os mínimos artificiais de 266 px e estilos de contêineres eliminados por `js/layout.js` também foram removidos. O atributo `hidden` continua a prevalecer sobre displays de layout. A matriz de muitos waypoints usa rolagem **interna e intencional** na régua de trechos; não há rolagem horizontal da página.

## Auditoria e testes

- Antes: 4.422 declarações, 144 atribuições repetidas ao mesmo seletor/propriedade, 102 valores conflitantes, 37 blocos de media query e 62 declarações `!important`.
- Depois: nenhuma atribuição repetida ou conflitante para o mesmo seletor/propriedade no mesmo contexto; 8 blocos de media query (7 larguras + movimento reduzido) e 8 declarações `!important` justificadas para elementos ocultos e movimento reduzido.
- 20 regras comprovadamente obsoletas de contêineres removidos pelo layout dinâmico foram eliminadas.
- `npm test`: 128 testes aprovados.
- Navegador: 320, 375, 390, 430, 768, 1024, 1440 e 1920 px; [72 estados auditados](browser-audit.json) nas quatro áreas e 56 combinações de módulo em quatro larguras, repetidas com EN-US, KG/L e A+; sem overflow horizontal. Também foram conferidos PT-BR, LB/GAL, A−/A/A+, estado sem OFP, OFP carregado, foco por teclado, aviso de combustível insuficiente e resultados extensos da matriz.

`js/layout.js` recebeu somente a correção do módulo inicial de **Em voo** para abrir Calibração, pois o valor anterior apontava para um módulo inexistente. O motor de cálculo, otimizadores, importação, calibração e persistência não foram alterados.
