# Velocity XL Performance Planner

Planejador visual para o **Black Square Velocity XL** no Microsoft Flight Simulator 2024. Importa o OFP mais recente do SimBrief por Pilot ID ou alias, utiliza a rota e os dados meteorológicos disponíveis e compara 27 combinações de nível e preset para apoiar a decisão do piloto.

**Somente para simulação.** O modelo é estimado e não certificado; não avalia separação do terreno ou obstáculos. Não usa SimConnect nem telemetria do Xbox.

## Fluxo

1. Importe um OFP do SimBrief.
2. Informe carga, combustível, reserva, oxigênio e, se desejar, preço do combustível.
3. Selecione um perfil preferido e use **Otimizar missão** em **Planejamento → Configuração**.
4. Em **Missão → Visão geral**, compare os três melhores FLs distintos. A recomendação automática fica separada da alternativa em análise.
5. No card escolhido, alterne ECON/NORMAL/FAST ou informe MAP/RPM no modo manual. Compare score, combustível, tempo, ICE, RIDE e margens antes de **Aplicar configuração**. Alternativas marginais exigem confirmação adicional; estados desconhecidos ou incompatíveis não podem ser aplicados.

A interface mantém quatro áreas: **Missão** (resultado e score), **Planejamento** (configuração, W&B, oxigênio e custos), **Rota & riscos** (ICE, RIDE, ETP/PNR, alternado/desvio, GLIDE e step climb) e **Em voo** (Tracker virtual, posição, combustível restante e calibração de cruzeiro). A atualização em voo não reclassifica retroativamente a missão planejada.

## Motor integrado

`js/unified-optimization.js` avalia os nove níveis FL100–FL250 em ECON, NORMAL e FAST: **27 combinações independentes**. Cada candidato reúne `calculateAtAltitude` e os módulos de gelo, turbulência, W&B, oxigênio, alternado, ETP/PNR, GLIDE, custo e Mission Score. Elegibilidade (`ELIGIBLE`, `MARGINAL`, `UNKNOWN`, `INCOMPATIBLE`) é avaliada antes do ranking. O Top 3 apresenta níveis distintos e plenamente viáveis; marginais aparecem separadamente. A configuração da tripulação e da bagagem permanece a informada pelo usuário. O cenário manual MAP/RPM usa o mesmo avaliador sem modificar a recomendação automática até aplicação explícita.

O combustível recomendado resolve iterativamente o efeito do próprio combustível no peso e na performance, visando a margem configurada em `js/config.js`, até o limite utilizável. Se não houver alternativa viável ou marginal avaliada, o painel apresenta **SEM RECOMENDAÇÃO CONFIRMADA** com os bloqueios disponíveis. Se faltarem evidências meteorológicas essenciais, o estado é **NÃO AVALIADO**, mesmo com pontuação numérica alta. O terreno e os obstáculos são sempre identificados como não avaliados.

As 27 combinações compartilham um único snapshot de **SimBrief, Open-Meteo GFS e AWC**. O GFS fornece temperatura, vento, umidade e nuvens por níveis reais de altura geopotencial; o AWC fornece SIGMET e PIREP publicados por um workflow do GitHub. A trajetória estimada amostra subida, cruzeiro, descida e desvio ao alternado. ICE e RIDE são avaliados ao longo dessas amostras, inclusive quando uma camada crítica é atravessada antes do cruzeiro. Um SIGMET relevante pode impedir a recomendação; indicadores numéricos de gelo e turbulência continuam sendo estimativas, não observações diretas nem certificação.

O AWC não oferece CORS para a aplicação estática. O arquivo [`.github/workflows/awc-snapshot.yml`](.github/workflows/awc-snapshot.yml), incorporado à `main`, publica o snapshot na branch `weather-snapshots` duas vezes por hora. O aplicativo identifica snapshots indisponíveis ou vencidos e usa as demais evidências disponíveis.

O perfil estimado possui, para cada fase, MAP, RPM, potência estimada, duração, distância e consumo. TAS, GS e fuel flow de cruzeiro são calculados com altitude, temperatura, peso, potência e vento por trecho. Subida e descida usam hipóteses de fase centralizadas em `js/config.js`; a fonte técnica não fornece uma tabela completa de MAP/RPM por preset e fase. Por isso, os presets diferenciam principalmente o cruzeiro, enquanto as hipóteses comuns de subida e descida permanecem explícitas. Não apresentamos essas hipóteses como tabela de performance certificada.

O **Mission Score 2.0** parte de 100 e desconta penalidades com pesos máximos: ICE 35, RIDE 20, combustível 15, performance 10, W&B 5, oxigênio 5, alternado 5 e eficiência/custo 5. Elegibilidade é avaliada antes do score: uma restrição impeditiva não pode ser compensada por uma boa pontuação. Se uma dimensão essencial não for avaliada, o score exibido fica indeterminado. MORA e Confidence Envelope não entram na fórmula.

## Calibração

Em cruzeiro estabilizado, o usuário pode informar no formulário único de **Em voo** posição, FL e combustível restante. **TAS observada** e **Fuel Flow observado** são opcionais em conjunto: vazios, a ação apenas atualiza o trecho restante; preenchidos, a mesma ação também calibra. Um único valor bloqueia o envio sem descartar o que foi digitado. O OFP precisa fornecer temperatura no ponto escolhido. O motor calcula:

- `K1 = TAS observada / TAS prevista`
- `K2 = GPH observado / GPH previsto`

Os fatores têm limites matemáticos em `js/config.js`, ficam salvos no `localStorage` e podem ser redefinidos. O contexto de referência guarda preset, FL, MAP, RPM, temperatura e peso estimado. A calibração só se aplica próxima desse regime; ela corrige o cruzeiro, sem alterar diretamente MAP/RPM nem calibrar subida ou descida. Calibrações antigas com K1/K2 válidos são preservadas, mas fatores legados sem referência suficiente ficam pendentes e não são aplicados em outro regime. A redefinição exige confirmação. Os registros antigos de Debrief não são apagados.

## Weather & Decision / Mission Profile

Em **Missão → Visão geral**, o perfil usa a trajetória e os segmentos integrados do candidato selecionado. As leituras de altitude, tempo e combustível são consultas ao modelo existente; o SVG não recalcula performance. A área azul usa Hermite monotônica com limite de desvio visual de 20 ft e controles lineares conservadores quando necessário. TOC/TOD usam as distâncias reais do resultado. O eixo é MSL, sem equivalência presumida com terreno.

O navlog completo fica disponível na busca de **Waypoints**, inclusive registros sem coordenadas. Distâncias OFP e geométricas são reconciliadas explicitamente em **Dados & fontes**; um ponto sem posição confiável não recebe ETA nem combustível. O agrupamento de marcadores depende da largura em pixels e não remove registros. **Mission Events** referencia TOC/TOD, fixes, ETP/PNR, reserva e amostras de risco já avaliadas.

As camadas METEO/ICE/RIDE/FUEL reutilizam o snapshot compartilhado e os índices existentes. As faixas mostram a resolução das amostras do modelo; não representam limites medidos de nuvens ou zonas meteorológicas. Cobertura ausente permanece desconhecida. Fontes, validade, resolução e limitações ficam recolhidas em **Dados & fontes**.

**Mission Time Machine**, recolhido por padrão, reavalia Original/+1h/+2h/+3h com a mesma previsão baixada. A iteração reutiliza o avaliador de candidatos e o solver de combustível, atualizando ventos por fase/fixo e verificando a convergência dos horários ao longo dos segmentos. Os limites estão em `PERFORMANCE.missionTime`: até oito iterações, 2 s e 0,02 gal de tolerância. Falta de cobertura ou convergência produz cenário indisponível; nenhuma requisição é disparada pelo slider ou pelas comparações. O cenário reavaliado permanece em análise, sem aplicar horário, combustível ou configuração à missão.

O **Mission Advisor** ocupa Ajuste principal e prioriza impedimentos físicos, dados desconhecidos, condições marginais, conflitos meteorológicos e oportunidades de eficiência. Ele usa justificativas determinísticas do motor. A prévia não inicia o Tracker, não grava checkpoints nem calibrações e não altera o ranking ou Mission Score aplicado. A reprodução visual percorre o voo em aproximadamente um minuto; o tempo exibido continua sendo o tempo previsto da missão.

## Virtual Flight Tracker

Em **Em voo**, aplique uma configuração da missão e pressione **Iniciar voo** quando começar a decolagem no simulador. O Tracker projeta posição, fase, FL, combustível e ETE com o perfil calculado de subida, cruzeiro e descida. O relógio usa a hora de início informada pela ação do piloto, separada do horário programado no OFP. O piloto pode pausar, retomar e escolher 1×, 2×, 4× ou 8×; o fator não é detectado automaticamente no Xbox.

**Sincronizar** registra um fixo observado. FL, combustível e correção de tempo são opcionais; uma leitura de combustível confirmada vira a nova referência somente dali para a frente. TOC/TOD e a fase podem ser confirmados no mesmo painel. O formulário técnico existente continua sendo o único lugar para TAS/Fuel Flow e calibração K1/K2. O Tracker não grava calibração a partir de um checkpoint simples.

**Projeção restante** usa o consumo integrado a partir da última âncora e o cálculo existente de reserva e alternado. ICE/RIDE só mostram índices planejados do trecho restante quando a cobertura é suficiente e o piloto confirma que o UTC do simulador corresponde ao OFP. Caso contrário, ficam **NÃO AVALIADOS**. A seção TOC/TOD mantém as referências do SimBrief separadas dos marcos calculados pelo modelo. O Mission Score pré-voo não muda.

A sessão fica no `localStorage` deste navegador, vinculada à identidade do OFP; outra missão não herda a progressão. Ao reabrir uma sessão em andamento, o tempo é reconstruído pelo relógio local e aparece um pedido de ressincronização. O aplicativo não sabe se o Xbox foi pausado ou acelerado durante o fechamento. O fim da rota projetada não encerra o voo automaticamente. **Somente para simulação; todos os valores dinâmicos sem confirmação são projeções, nunca observações do Xbox.**

## Limitações dos módulos

- **ICE/RIDE:** índices heurísticos combinam evidência do OFP, previsão GFS e avisos AWC quando disponíveis. Dados ausentes permanecem desconhecidos. O índice de gelo não é probabilidade certificada; gradiente de vento não equivale a EDR observado. A unidade do campo `shear` do SimBrief não foi confirmada e ele não provoca bloqueio severo no motor 2.0.
- **ETP/PNR:** integra ventos e tempos por trecho quando o navlog fornece coordenadas e distâncias; lacunas usam a média da rota. Reserva, subida, descida e consumo estimado participam do PNR.
- **GLIDE:** alcance e tempo teóricos. Altitude MSL não indica altura livre sobre o terreno; nenhum local de pouso é classificado como seguro.
- **Alternado/desvio:** requer coordenadas ou distância utilizável; estima tempo, combustível e margem no pouso.
- **Financeiro:** depende do preço por litro informado manualmente em BRL ou USD. Preço ausente produz custo indisponível, nunca custo zero.
- **Persistência:** preferências, calibração e sessão do Tracker são locais ao navegador/dispositivo. A configuração aplicada e o Tracker são restaurados somente para o mesmo OFP; escolhas antigas não passam para outra missão.

## Central de Ajuda e planejamento guiado

O ícone **?** do cabeçalho abre a Central de Ajuda, com índice pesquisável de funcionalidades e explicações PT/EN. Botões contextuais de ajuda em painéis selecionados utilizam o mesmo cadastro em `js/help-registry.js`. O catálogo contém 51 tópicos, incluindo os quatro grupos de navegação, Flight Ribbon, Resilience Lab e Tracker.

O roteiro guiado de 16 etapas navega pelos módulos existentes e destaca controles reais, sem duplicar o planejador. Importação, otimização, escolha de candidato e aplicação avançam somente após confirmação pelo mecanismo principal. Etapas de conferência solicitam confirmação explícita do piloto, sem alterar configurações. A etapa final explica o Tracker **sem iniciá-lo automaticamente**.

A posição concluída do roteiro é armazenada em `localStorage` (`velocityxl.help.v1`), sem Pilot ID nem dados do OFP. Ao retomar, pré-requisitos são verificados para evitar continuar sobre um plano ausente ou resultado que deixou de ser válido. O guia pode ser fechado e retomado sem modificar a sessão real de voo.

## Executar e verificar

```bash
npm ci
npm run serve
```

Abra `http://localhost:4173/`. Para executar a suíte e as verificações visuais:

```bash
npm test
npm run lint:css
npm run audit:browser
npm run audit:browser:v2
npm run audit:tracker
npm run audit:profile
npm run validate:missions
npm run verify:weather-live
```

A auditoria de navegador usa um OFP **sintético**, com números ilustrativos, em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px. As capturas e o relatório ficam em `review/`. A verificação de rede é opcional e controlada: não consulta SimBrief sem `SIMBRIEF_PILOT_ID`, para evitar polling não autorizado. O relatório do Tracker está em [`review/virtual-flight-tracker-v1/report.md`](review/virtual-flight-tracker-v1/report.md).

## Fontes técnicas

- [SimBrief — Fetching a User's Latest OFP Data](https://developers.navigraph.com/docs/simbrief/fetching-ofp-data)
- [Navigraph — formato JSON v2 do fetcher](https://forum.navigraph.com/t/fetching-a-users-latest-ofp-data/5297)
- [Black Square Velocity XL User Guide](https://downloads.justflight.com/products/JFF003720/BKSQ_VelocityManual.pdf)
- [Open-Meteo GFS API](https://open-meteo.com/en/docs/gfs-api)
- [Aviation Weather Center API](https://aviationweather.gov/data/api/)

O manual documenta os limites do motor e procedimentos gerais; os coeficientes de TAS, consumo e fases do aplicativo são estimativas configuráveis em `js/config.js`. Os dados de performance de uma aeronave experimental específica devem ser calibrados no simulador, pois esta aplicação não possui telemetria.

## Licença

MIT
