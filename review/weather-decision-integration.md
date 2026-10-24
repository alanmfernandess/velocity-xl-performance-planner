# Weather & Decision — pontos de integração

Base de trabalho: `origin/main` em `c58345d`. Implementação isolada em `feature/weather-decision-mission-profile`; publicação depende de aprovação.

- `js/app.js` guarda o OFP em `state.plan` e o snapshot compartilhado em `state.weatherSnapshot`. `latestOptimizedMission` contém os 27 candidatos; `decisionSnapshot` guarda o ranking confirmado. `analysisChoice`/`analysisCandidate` e `state.appliedChoice` continuam separados. A sessão do Tracker é independente.
- `js/layout.js` monta as quatro áreas e move os componentes existentes. O novo card entra entre `#pilotDecisionPanel` e `.summary-grid` em `mission:overview`. O Advisor usa `#missionScoreAction`, já localizado em Ajuste principal.
- `candidate.result.trajectory` fornece a escala, amostras meteorológicas, rota, TOC e TOD. `buildVirtualFlightProfile`, `sampleVirtualProfile` e `virtualTimeAtDistance` já integram os segmentos reais de subida/cruzeiro/descida e serão reutilizados para leituras e combustível.
- O importador preservará também o navlog completo, com qualidade de posição explícita, sem alterar o array operacional usado pelos cálculos atuais. O adaptador visual documentará a reconciliação da distância OFP com a trajetória.
- ICE/RIDE já fornecem segmentos, evidências e cobertura. METEO reutilizará `gfsSampleStatus`/`weatherAt`; a interface não calculará novos índices. METAR/TAF usarão `terminalWeatherAtTime`, sem classificador textual adicional.
- O Time Machine reutilizará o avaliador e o fuel solver existentes com um plano atmosférico por timestamp, mantendo a referência de pontuação original. A iteração temporal terá limite e tolerância explícitos. Cobertura insuficiente e falta de convergência não produzirão recomendação.
- ETP/PNR, alternado, GLIDE, O₂, W&B, ICE/RIDE e Tracker continuam em seus módulos. Seus resultados serão referenciados pelos eventos e pelo Advisor, sem novos motores.
- `styles.css` permanece a única folha. A composição nova usa os tokens e componentes de `review/design-system.md`; os breakpoints existentes receberão apenas regras do módulo. Nenhum novo observador de mutações será criado.
- A validação inclui funções puras, fixtures extensos de waypoints, todas as auditorias existentes e uma auditoria específica com capturas reais em oito larguras. As prévias usam OFP e meteorologia sintéticos identificados como ilustrativos.
