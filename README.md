# Velocity XL Performance Planner

Dashboard gráfico, bilíngue e responsivo de planejamento pré-voo para o **Black Square Velocity XL** no Microsoft Flight Simulator. O aplicativo importa o OFP mais recente do SimBrief e cruza a rota e a atmosfera com um modelo próprio de performance da aeronave.

> **Aviso:** estimativas para simulação, não certificadas. Não use para voo real. O aplicativo não usa SimConnect nem telemetria do Xbox.

## Recursos

- Importação por SimBrief Pilot ID ou Navigraph Alias usando o endpoint oficial `xml.fetcher.php` com `json=v2`.
- Uso exclusivo da rota, dos waypoints e dos dados atmosféricos do OFP; o tipo e os cálculos de aeronave do SimBrief são ignorados.
- Interpolação de vento e OAT por waypoint para comparar FL100 a FL250.
- Icing-Aware Level Optimizer usando OAT por waypoint/nível e evidências meteorológicas presentes no OFP para evitar ou penalizar faixas com risco de gelo.
- Interface clara e minimalista em português do Brasil e inglês americano.
- Escala de tipografia ajustável e unidades selecionáveis LB/KG e GAL/L.
- Manifesto instalável com apresentação standalone, semelhante a um aplicativo.
- Comparação de FL100 a FL250 nos modos ECON, NORMAL e FAST.
- Potência automática por modo ou ajuste manual de MAP/RPM, refletida em TAS, fuel flow, tempo, combustível e alcance.
- Indicador explícito de viabilidade usando combustível, peso, teto e espaço disponível para subida/cruzeiro/descida.
- Níveis de cruzeiro inviáveis são desabilitados automaticamente e excluídos da recomendação.
- TAS, GS, ISA deviation, componente de vento, climb/cruise/descent, combustível, endurance e alcance.
- ETP e PNR calculados com velocidades de continuação e retorno corrigidas pelo vento.
- Alternate & Diversion Advisor com distância direta, tempo, consumo, combustível estimado no pouso e viabilidade de reserva.
- Comparador A/B de modo, nível, payload e combustível, com deltas de consumo, tempo, GS e margem.
- Otimizador global no card principal: compara ECON, NORMAL e FAST e aplica automaticamente o preset, FL, combustível, payload, CG e oxigênio que produzam a melhor missão viável.
- Controles permanecem livres após a otimização, com recálculo contínuo de VIÁVEL, MARGINAL ou NÃO VIÁVEL a cada ajuste manual.
- Weight & Balance/CG de cinco assentos com pesos individuais, bagagem, oxigênio, combustível, momentos por estação e gráfico dinâmico da trajetória ZFW–decolagem–pouso dentro do envelope.
- Engine-Out Glide Corridor usando razão de planeio 12,15:1 e 90 KIAS, com alcance corrigido pelo vento ao longo do perfil.
- Cabin Altitude & Oxygen Planner para a configuração personalizada de cinco assentos, com ocupação individual, consumo por altitude, autonomia, saídas disponíveis, recomendação de garrafas e peso dos sistemas no peso de decolagem.
- Mission Risk Score consolidando viabilidade, margem de combustível, gelo, turbulência, oxigênio, confiança do modelo e situação do alternado.
- Performance Confidence Envelope com faixas baixa/esperada/alta para combustível, ETE, TAS e alcance.
- Flight Debrief & Model Accuracy, que compara tempo e combustível reais com a previsão e refina gradualmente os fatores de TAS e fuel flow de cada preset.
- Turbulence & Ride Comfort Optimizer usando avisos meteorológicos do OFP e gradientes de vento por nível/trecho para comparar conforto entre FLs.
- Step Climb Advisor com pontos vinculados aos waypoints e atualização manual por posição, FL e combustível restante.
- Calibração local por modo usando somente TAS e fuel flow observados no Xbox; os fatores ficam salvos no dispositivo.
- Gráficos de performance, perfil vertical, representação de rota e perfil de combustível organizados em abas.
- Tela inicial vazia até a importação de um OFP real e armazenamento local somente do identificador SimBrief.
- Coeficientes centralizados em `js/config.js` para calibração manual futura.

## Executar localmente

```bash
npm run serve
```

Abra `http://localhost:4173`.

## Testes

```bash
npm test
```

## Fontes e premissas

- [Documentação oficial do SimBrief — Fetching OFP Data](https://developers.navigraph.com/docs/simbrief/fetching-ofp-data)
- [Documentação oficial do SimBrief — Using the API](https://developers.navigraph.com/docs/simbrief/using-the-api)
- [Manual Black Square Velocity XL](https://downloads.justflight.com/products/JFF003720/BKSQ_VelocityManual.pdf)
- [FAA AIM — Hypoxia and supplemental oxygen](https://www.faa.gov/Air_traffic/publications/atpubs/aim_html/chap8_section_1.html)
- [Aerox Sky-Ox — Use and Care](https://www.aerox.com/content/2022%20Use%20and%20care%20-%20Sky-ox.pdf)
- [FAA AIM — Turbulence reporting criteria](https://www.faa.gov/air_traffic/publications/atpubs/aim/aim0701.html)
- [FAA Aviation Weather Handbook](https://www.faa.gov/regulationspolicies/handbooksmanuals/aviation/faa-h-8083-28b-aviation-weather-handbook)

O manual informa 400 hp, twin turbo, altitude crítica de 24.000 ft, teto de serviço de 25.000 ft, 92 gal totais/87 úteis, peso vazio de 1.900 lb e peso máximo de 3.000 lb. Também informa 32 inHg e 2.700 RPM como limites, Maximum Continuous em subida, 2.650 RPM na subida inicial, 2.600 RPM em enroute climb e 2.450 RPM em cruzeiro. O controlador absoluto é modelado mantendo aproximadamente 29,6 inHg até a altitude crítica de densidade, com redução de MAP disponível acima dela.

Os presets estimados são ECON 20 inHg/2.300 RPM, NORMAL 24 inHg/2.450 RPM e FAST 28 inHg/2.500 RPM. No modo manual, MAP e RPM modificam a potência estimada; a TAS varia pela aproximação de potência cúbica e o fuel flow acompanha a potência. Esses coeficientes não substituem uma tabela MAP/RPM do fabricante e continuam centralizados em `js/config.js` para calibração. ETP, PNR e step climbs são referências de planejamento para simulação e não procedimentos certificados.

O Alternate & Diversion Advisor usa as coordenadas do alternado quando fornecidas pelo OFP; sem coordenadas, o cálculo fica indisponível. O combustível até o alternado inclui estimativas centralizadas de arremetida e aproximação. O Glide Corridor assume altitude sobre o nível do mar, não considera relevo, obstáculos, razão de planeio degradada, configuração, falhas adicionais ou locais de pouso; serve exclusivamente como referência visual para o simulador.

A viabilidade considera o combustível requerido completo, peso máximo, teto de serviço e a distância necessária para subida e descida. Um nível marginal continua selecionável; um nível inviável é desabilitado e não participa da recomendação. Os limites de margem permanecem centralizados em `js/config.js`.

O Icing-Aware Level Optimizer mantém separado o ótimo puro de performance do nível recomendado pela meteorologia. Indicações explícitas de gelo ou precipitação congelante tornam incompatíveis os níveis afetados e também consideram a passagem pela camada durante subida e descida. METAR e TAF de origem/destino são aplicados somente às transições locais; nuvens terminais sem topo informado recebem uma espessura e um peso conservadores configuráveis, sem serem estendidas por toda a rota. Quando há apenas OAT sem confirmação de umidade, o resultado é marcado como dado limitado e não bloqueia níveis. O `ICE INDEX` é um índice heurístico de 0 a 100, não uma probabilidade meteorológica. A diferença de combustível, tempo, GS e alcance é recalculada pelo modelo no FL alternativo, sem simular voo deliberado com gelo acumulado.

O otimizador global testa FL100–FL250 nos três presets com potência automática mesmo quando o ajuste manual atual já é viável. Ele pode aumentar ou reduzir combustível e oxigênio, escolher outro nível e aplicar o melhor ajuste para a finalidade de ECON, NORMAL ou FAST. Mantém a reserva escolhida e a carga real sempre que possível; quando isso não basta, reduz primeiro a bagagem e depois o restante do payload até o limite mínimo do piloto. Se o preset selecionado não oferecer uma solução adequada, troca automaticamente para o preset que preserve mais carga útil e produza um resultado VIÁVEL. A margem-alvo é de 6 gal sobre o requerido e 80 lb abaixo do peso máximo. Se nem a configuração piloto-only atender à missão, o sistema mantém NÃO VIÁVEL em vez de apresentar uma solução artificial. A aplicação é global: CG, gelo, turbulência, oxigênio, risco, perfis, alternativas e demais painéis são recalculados; depois disso, todos os controles continuam disponíveis para ajuste independente.

O Weight & Balance usa os braços de exemplo do manual do Velocity XL N97XL: piloto/copiloto 80 in, passageiros traseiros 124 in, header/sump 145 in, combustível principal 132 in, bagagem/wing strake 115 in e lastro dianteiro 24 in. O terceiro assento traseiro da configuração Black Square foi adaptado no mesmo braço longitudinal de 124 in do banco traseiro; portanto, não há cálculo de equilíbrio lateral. O combustível é separado entre os primeiros 4 gal do header e o volume restante dos tanques principais, e as garrafas de oxigênio entram no braço da área de bagagem. O envelope longitudinal usa 127–134 in e o limite superior de 3.000 lb do addon. Como o manual exige pesagem e braços específicos de cada aeronave experimental, o peso vazio de 1.900 lb foi associado ao CG vazio de exemplo 141,63 in exclusivamente para simulação. Esses parâmetros ficam centralizados em `js/config.js` e não devem ser usados em uma aeronave real.

O Oxygen Planner usa como base internacional o FAA 14 CFR §91.211: tripulação acima de 12.500 ft por mais de 30 minutos, uso contínuo da tripulação acima de 14.000 ft e oxigênio disponibilizado a todos os ocupantes acima de 15.000 ft. A configuração solicitada tem cinco assentos — piloto, copiloto e três passageiros traseiros — e é independente da configuração descrita pelo fabricante do addon. Vazões, capacidades, número de saídas e pesos cheios vêm da documentação Aerox Sky-Ox; cânulas são limitadas a 18.000 ft e o modelo passa a considerar máscaras acima desse nível. A reserva de oxigênio é estimada em 15 minutos. Os valores servem somente para o simulador.

O Ride Comfort Optimizer interpreta menções explícitas a TURB/CAT, AIRMET Tango, SIGMET e tempestades no conteúdo meteorológico de rota, prioriza o campo `shear` de cada fix quando o OFP o fornece e complementa isso com uma estimativa baseada na mudança vetorial do vento entre níveis e trechos. O `shear` do navlog é válido somente próximo à altitude daquele fix e nunca é replicado por toda a faixa FL100–FL250. Avisos sem limites verticais são mantidos como alerta moderado, mas não bloqueiam todos os níveis; somente uma faixa vertical explícita que cubra o FL avaliado ou um `shear` severo aplicável àquele nível pode desabilitá-lo. Objetos não documentados de SIGMET/AIRMET não são mais convertidos em texto por concatenação de campos. Mudanças entre trechos muito curtos usam uma distância mínima de normalização e a inferência isolada é limitada a MODERADO. METAR/TAF terminal não é extrapolado para o cruzeiro. O Mission Risk Score, o `ICE INDEX` e o Performance Confidence Envelope são índices próprios, não probabilidades certificadas. Debriefs ficam apenas no `localStorage`, são separados por preset e aplicam uma correção conservadora de 20% do erro observado por voo.

O mapa preserva a ordem completa dos fixes do navlog do SimBrief, acrescenta origem e destino quando esses aeroportos não vêm repetidos no navlog e mantém todos os waypoints visíveis. TOC e TOD usam diretamente os pontos fornecidos pelo OFP; quando ausentes, são inseridos nas distâncias calculadas pelo modelo. A projeção também normaliza rotas que cruzam a Linha Internacional de Data.

A calibração é separada por ECON, NORMAL e FAST. O usuário seleciona posição, FL e combustível restante, informa TAS e fuel flow estabilizados vistos no Xbox e aplica dois fatores limitados de correção. Nenhum dado é transmitido; a calibração usa `localStorage` no navegador.

O endpoint público permite buscar um OFP já gerado. O usuário gera o voo no SimBrief e depois informa o Pilot ID ou Navigraph Alias no planner. Tipo de aeronave, pesos, TAS, GS, tempos, combustível, TOC e TOD fornecidos pelo SimBrief não entram no cálculo do Velocity XL.

## Licença

MIT
