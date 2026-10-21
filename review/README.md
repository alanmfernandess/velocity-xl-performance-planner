# Etapa 1 — Unified Mission Optimization Engine

Branch: `feature/unified-mission-optimization`, criada a partir de `visual-css-consolidation` (`5cabda7`). Esta prévia **não foi incorporada à `main` nem publicada no GitHub Pages**. Execute `npm run serve` nesta branch e abra `http://127.0.0.1:4173/` para navegar.

## 1. Arquitetura

`js/unified-optimization.js` recebe o OFP, preset, configuração da aeronave, W&B, oxigênio, reserva, calibração, preferência RIDE e preço. Avalia os nove FLs usando um único conjunto de candidatos e devolve `optimizedMission` com candidato selecionado, perfil de potência, reservas, ICE, RIDE, W&B, O₂, ETP/PNR, GLIDE, alternado, custo, Mission Score, razões e limitações. A interface consome o mesmo candidato para o resumo e os módulos. **Otimizar missão** revela a proposta; **Aplicar configuração** é a única ação que grava o FL e o combustível recomendados.

## 2. Matemática e potência por fase

- A solução de combustível recalcula performance e peso até estabilizar a margem alvo de 6 gal, respeitando o limite utilizável; não altera ocupantes nem bagagem.
- O cruzeiro integra GS por trecho do navlog quando há distância, posição e vento. O ETP iguala tempos integrados de ida/retorno; o PNR inclui combustível para alcançar a posição, voltar, descer e manter reserva.
- Subida, cruzeiro e descida têm MAP, RPM, potência estimada, tempo, distância, GPH e consumo ligados aos cálculos. Os coeficientes de fase estão em `js/config.js`. A [lista de verificação do manual Black Square](https://downloads.justflight.com/products/JFF003720/BKSQ_VelocityManual.pdf) orienta limites e procedimentos gerais, mas não oferece tabela completa por preset para as três fases. Subida e descida continuam hipóteses comuns explícitas; os presets diferenciam o cruzeiro. Os valores de GPH, TAS, razão de subida e descida permanecem estimativas para simulador.

## 3. Seleção automática do FL

Primeiro são classificados combustível/capacidade, perfil, W&B, O₂, ICE impeditivo, RIDE impeditivo e alternado. Dentro de cada classe de viabilidade, o motor combina Mission Score e preferência do preset por combustível, tempo, alcance e conforto. A preferência RIDE ajusta o peso do conforto no mesmo ranking. O resultado inclui o FL global, o de menor ICE e o de melhor RIDE. Meteorologia insuficiente produz `NÃO AVALIADO`; não vira evidência de ausência de risco.

## 4. Mission Score

Parte de 100 e desconta margem de combustível, incompatibilidade de perfil, W&B, gelo, turbulência, oxigênio, alternado, eficiência da missão e impacto financeiro quando há preço. Cada perda tem motivo e impacto. Um bloqueio físico limita a pontuação a 39; o **status operacional** permanece independente e pode ser `VIÁVEL`, `MARGINAL`, `INVIÁVEL` ou `NÃO AVALIADO`. MORA e Confidence Envelope não são consultados. Terreno e obstáculos são declarados não avaliados.

## 5. K1 e K2

`K1 = TAS observada / TAS prevista`; `K2 = GPH observado / GPH previsto`. A medição requer cruzeiro estabilizado, posição/FL/combustível restante e temperatura no OFP para o fix escolhido. São registrados preset, MAP, RPM, FL, OAT, peso estimado e data como regime de referência. Fora da tolerância de regime, os fatores não são aplicados. K1 afeta TAS, GS, tempo, consumo dependente do tempo, alcance e ETP/PNR; K2 afeta GPH, combustível de cruzeiro, custo e PNR. A reserva usa a hipótese ECON própria do modelo e não recebe K2 fora do regime de referência. Nenhum fator modifica MAP/RPM nem calibra subida ou descida. Dados antigos válidos com dois fatores são migrados; o JSON legado é preservado localmente como cópia. Leituras inválidas são rejeitadas e os fatores podem ser redefinidos.

## 6. Módulos

**Retirados do fluxo e do código:** MORA/terreno, matriz de níveis, comparação A/B, Confidence Envelope, Debrief, comparação manual de FL, otimizadores antigos de carga/modo/missão, gráficos e utilitários sem uso.

**Preservados/refinados:** SimBrief, W&B, oxigênio, custos e alternado, ETP/PNR por trecho, GLIDE conservador, ICE, RIDE, step climb e atualização em voo. O preço de combustível continua manual; ausência de preço é indisponibilidade de custo.

## 7. Verificação

| Verificação | Resultado |
| --- | --- |
| `npm test` | 86 testes aprovados, nenhum erro |
| `npm run lint:css` | 841 regras; 2.807 declarações; zero problemas |
| `npm run audit:browser` | 257 estados; zero falhas; 21 capturas |
| Larguras | 320, 375, 390, 430, 768, 1024, 1440 e 1920 px |
| Variações | PT-BR/EN-US, LB/KG, GAL/L, A−/A/A+, foco, OFP ausente/carregado, mensagens longas |

Comparado à base CSS da branch visual (`1.223` regras, `3.952` declarações), foram removidas **382 regras** e **1.145 declarações** obsoletas. `styles.css` continua como única folha da aplicação; não foi criada uma nova camada de sobrescritas. O relatório detalhado de navegador está em [browser-audit.json](browser-audit.json).

## 8. Demonstração com OFP sintético

A auditoria intercepta a importação e injeta um OFP **sintético de 18 waypoints**, sem chamada ao SimBrief. Exemplo ilustrativo da tela: **SBSP → SBGL, 246 NM, NORMAL, FL120, 39,5 gal recomendados, ETE 01:02**. O status aparece **NÃO AVALIADO** quando a evidência meteorológica da amostra não sustenta confirmação. Os números e o nível não são uma recomendação para um voo real.

| Área | Desktop 1440 px | Tablet 768 px | Celular 390 px |
| --- | --- | --- | --- |
| Missão | [Captura](final/desktop-mission-overview.png) | [Captura](final/tablet-mission-overview.png) | [Captura](final/mobile-mission-overview.png) |
| Otimização | [Captura](final/desktop-planning-optimize.png) | [Captura](final/tablet-planning-optimize.png) | [Captura](final/mobile-planning-optimize.png) · [tela inteira](final/mobile-planning-optimize-full.png) |
| Rota / ICE | [Captura](final/desktop-route-ice.png) | [Captura](final/tablet-route-ice.png) | [Captura](final/mobile-route-ice.png) |
| Em voo | [Captura](final/desktop-flight-calibration.png) | [Captura](final/tablet-flight-calibration.png) | [Captura](final/mobile-flight-calibration.png) · [tela inteira](final/mobile-flight-calibration-full.png) |

## 9. Limitações restantes

- Não há telemetria; a calibração depende das leituras fornecidas pelo usuário e da atmosfera do OFP. Ela não valida regimes fora da referência.
- Não há tabela detalhada e verificada de MAP/RPM/GPH para cada fase e preset do addon. Os coeficientes atuais são hipóteses configuráveis, não dados certificados.
- ICE/RIDE dependem da cobertura e validade dos dados meteorológicos do OFP. Índices são heurísticos, não probabilidades.
- GLIDE não conhece altura sobre terreno nem obstáculos; nenhum ponto de pouso é declarado seguro.
- O teste visual automatizado roda no Chromium; Safari iOS e aparelhos físicos não foram medidos nesta etapa.
- Dados locais antigos permanecem no navegador, incluindo histórico de Debrief, mas o módulo e os fatores antigos não são executados.
