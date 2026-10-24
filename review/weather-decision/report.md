# Weather & Decision / Mission Profile — revisão

Implementação na branch `feature/weather-decision-mission-profile`, baseada em `origin/main` (`c58345d`). **Sem integração à main e sem publicação em produção.** A prévia navegável está no aplicativo local em `http://localhost:4173/`; a importação de OFP continua sendo uma ação explícita do usuário.

## Integração e funcionalidades

O novo card fica em **Missão → Visão geral**, depois dos quatro KPIs e do Top 3, antes do Mission Score e do Ajuste principal. As quatro áreas existentes permanecem. ICE/RIDE, ETP/PNR, alternado, GLIDE, O₂ e W&B continuam em seus módulos. O Tracker continua em Em voo. Os [pontos de integração](../weather-decision-integration.md) foram registrados antes da implementação.

O card contém a área azul suave, TOC/TOD, indicador de progressão, faixas METEO/ICE/RIDE/FUEL, busca no navlog completo, navegação de waypoints e um evento por vez. Selecionar um ponto ou evento usa a mesma consulta de distância/tempo/combustível que posiciona o indicador. Marcadores próximos são agrupados por largura de tela; nenhum registro é removido da busca.

O Time Machine fica recolhido. Original/+1h/+2h/+3h são comparações; a reavaliação não aplica configuração, horário ou combustível. O Mission Advisor utiliza o card Ajuste principal, com prioridade para impedimentos físicos, dados essenciais desconhecidos, condições marginais, conflitos meteorológicos e eficiência. Suas justificativas são determinísticas e rastreáveis.

## Cálculos reutilizados e adaptações

| Responsabilidade | Implementação |
| --- | --- |
| Trajetória e escala | `candidate.result.trajectory`, TOC/TOD e rota do motor existente |
| Tempo e combustível | `buildVirtualFlightProfile`, `sampleVirtualProfile`, `virtualTimeAtDistance`; segmentos detalhados de subida/cruzeiro/descida |
| Perfil visual | `buildMissionProfile`, consultas por distância/tempo, Hermite monotônica com controles lineares conservadores |
| Waypoints | Navlog completo normalizado em `ofpWaypoints`; distâncias cumulativas, reconciliação explícita e geometria somente quando há referências suficientes |
| Meteorologia | Snapshot compartilhado, `sampleGfs`, `gfsSampleStatus`, `weatherAt`, índices ICE/RIDE e validade METAR/TAF existente |
| Faixas de risco | Metadados por amostra já avaliada, expostos sem alterar fórmulas, scores ou critérios de cobertura |
| Cenários temporais | `evaluateMissionAlternative` e fuel solver existentes, com entrada atmosférica específica do cenário e mesma referência de score |
| Eventos | Adaptador dos resultados de trajetória, amostras de risco, ETP/PNR e reserva |
| Advisor | Bloqueios, desconhecidos e razões existentes; sem IA generativa |

O gráfico usa uma referência única de distância. Quando a distância final do navlog difere da trajetória, o fator é declarado em Dados & fontes. Lacunas podem usar geometria entre âncoras OFP verificáveis; sem referências suficientes, o waypoint permanece sem posição, ETA ou combustível. Identificadores ausentes não são substituídos por fixes fictícios na visualização.

Tempo e consumo são interpolados por segmento integrado. Não há distribuição proporcional do tempo total pela distância total. A hora absoluta depende de uma partida UTC válida; datas e mudança de dia são preservadas. O combustível inicial do perfil usa a referência do candidato, descontando o táxi conforme o motor existente.

A suavização só afeta o desenho. A curva atravessa os nós, preserva TOC/TOD e trechos nivelados e não ultrapassa o intervalo de altitude de cada segmento. Um desvio visual maior que 20 ft usa controles lineares, mantendo os números exatamente no modelo original. Origem/destino são MSL; a referência inferior não recebe o nome GND.

O Time Machine amostra a previsão compartilhada nos horários previstos das fases e fixes e repete o mesmo avaliador. A convergência exige até 2 s de diferença nos horários ao longo dos segmentos e até 0,02 gal de diferença no trip fuel, com máximo de oito iterações, configuráveis em `PERFORMANCE.missionTime`. Original e partidas deslocadas usam esse mesmo processo quando o painel é aberto. Resultado sem cobertura atmosférica suficiente ou sem convergência fica indisponível. Os 27 candidatos, o ranking, a aplicação manual MAP/RPM e o Mission Score original mantêm seus critérios e estados.

## Design System

| Exigência de `review/design-system.md` | Resultado |
| --- | --- |
| Uma folha de produção | Apenas `styles.css`; regras do módulo na seção de módulos e breakpoints existentes |
| Fonte e escala | Mesma família e papéis de 12/14/16/24 px; A−/A/A+ preservados |
| Campos e botões | Componentes existentes, fonte editável mínima de 16 px e controles de 44 px |
| Cards | Altura natural; comparações de horário compactas; detalhes recolhidos |
| Largura | Shell existente de até 1180 px; gráfico sem rolagem horizontal |
| Celular | Coluna real para altitude, leituras adaptativas, navegação inferior e safe areas mantidas |
| Acessibilidade | Foco visível, teclado, slider nativo, busca e navegação vertical; ampliação preservada |
| Rolagem | Barras ocultas no mobile sem impedir toque ou teclado |

Não foram introduzidos framework visual, quinta área, gráficos alternativos, nuvens volumétricas nem avisos narrativos permanentes. Detalhes de fontes e limites ficam recolhidos. A identificação global MSFS 2024 fica no rodapé.

## Testes e evidências

- `npm ci`: concluído.
- `npm test`: **206 testes aprovados**, incluindo 36 novos; auditoria CSS sem problemas.
- `npm run validate:missions`: **11 cenários validados**, seis sem recomendação preservados.
- `npm run audit:browser`: **322 estados, 0 falhas**, 49 capturas.
- `npm run audit:browser:v2`: **386 estados, 0 falhas**, 92 capturas.
- `npm run audit:tracker`: **59 estados, 0 falhas**, 38 capturas.
- `npm run audit:profile`: **140 estados, 0 falhas**, 10 capturas específicas. [Relatório completo](browser-audit.json).
- `npm run verify:weather-live`: GFS e os fluxos AWC verificados numa única execução; SimBrief não consultado por ausência de `SIMBRIEF_PILOT_ID`. [Resultado](live-weather.json).

As auditorias cobrem 320, 375, 390, 430, 768, 1024, 1440 e 1920 px, PT/EN, LB/KG, GAL/L e A−/A/A+. Os testes matemáticos incluem navlogs de 0, 1, 8, 48, 84 e 150 registros, duplicatas, distâncias inconsistentes, coordenadas ausentes/inválidas, continuidade das fases, limites da curva, mudança de dia, falta de vento, cobertura espacial/vertical/temporal e ausência de convergência. As verificações de interface incluem reprodução, busca por teclado, eventos, cenário manual em EN/L, troca de OFP e preservação da sessão/calibração/ranking.

**As capturas são reais de navegador, com OFP e meteorologia sintéticos identificados como dados ilustrativos.** Não representam um voo real importado. Os recortes do card ocultam a barra fixa de navegação somente durante a captura; a navegação e a reserva de espaço são verificadas separadamente.

| Prévia | Celular · 390 px | Tablet · 768 px | Desktop · 1440 px |
| --- | --- | --- | --- |
| Mission Profile | [captura](390-profile.png) | [captura](768-profile.png) | [captura](1440-profile.png) |
| Página completa | [captura](390-overview.png) | [captura](768-overview.png) | [captura](1440-overview.png) |
| Time Machine | [captura](390-time-machine.png) | — | [captura](1440-time-machine.png) |
| Dados indisponíveis | [sem UTC](390-unavailable.png) | — | [fora da previsão](1440-unavailable.png) |

## Limitações explícitas

- GFS/ICE/RIDE continuam sendo estimativas do modelo. As faixas representam intervalos das amostras, sem definir base/topo de nuvens nem limites medidos de uma zona meteorológica.
- O Time Machine utiliza apenas as séries baixadas e válidas. Não busca arquivos históricos nem reaproveita condições fora da janela de previsão.
- A resolução do vento/performance continua a do motor existente: perfil de partida na subida, seções por trecho em cruzeiro e perfil de chegada na descida. O novo solver reconcilia seus timestamps, sem introduzir outro modelo aerodinâmico.
- Uma incompatibilidade entre a elevação real dos aeroportos e os limites do perfil existente produz perfil indisponível, em vez de corrigir a altitude silenciosamente. Isso também protege o caso de aeroportos abaixo do nível do mar quando o motor limita a fase a zero.
- O OFP real do usuário não foi consultado nesta rodada. As importações, a matemática e a interface foram verificadas com fixtures; o teste ao vivo confirmou apenas os provedores disponíveis sem Pilot ID.
- A prévia é local à interface; checkpoints e calibrações do Tracker não modificam retroativamente esse planejamento.

## Arquivos

Criados: `js/mission-profile.js`, `js/mission-profile-view.js`, `js/mission-time.js`, `js/mission-events.js`, `tests/mission-profile.test.mjs`, `tests/fixtures/mission-profile.mjs`, `scripts/audit-mission-profile.mjs`, `review/weather-decision-integration.md` e as evidências deste diretório.

Alterados: `index.html`, `styles.css`, `js/layout.js`, `js/app.js`, `js/config.js`, `js/simbrief.js`, `js/unified-optimization.js`, `js/weather/exposure.js`, `package.json`, `tests/visual-architecture.test.mjs`, `README.md` e `.github/workflows/validate-ice-coverage.yml`.
