# Velocity XL Performance Planner

Dashboard gráfico, bilíngue e responsivo de planejamento pré-voo para o **Black Square Velocity XL** no Microsoft Flight Simulator. O aplicativo importa o OFP mais recente do SimBrief e cruza a rota e a atmosfera com um modelo próprio de performance da aeronave.

> **Aviso:** estimativas para simulação, não certificadas. Não use para voo real. O aplicativo não usa SimConnect nem telemetria do Xbox.

## Recursos

- Importação por SimBrief Pilot ID ou Navigraph Alias usando o endpoint oficial `xml.fetcher.php` com `json=v2`.
- Uso exclusivo da rota, dos waypoints e dos dados atmosféricos do OFP; o tipo e os cálculos de aeronave do SimBrief são ignorados.
- Interpolação de vento e OAT por waypoint para comparar FL100 a FL250.
- Matriz responsiva de níveis por trecho da rota, com MORA exata do navlog, fase do voo, componente de vento por FL e índice de gelo onde houver evidência aplicável no OFP. A faixa superior permite navegar por 10, 20 ou mais waypoints; no celular, um trecho é mostrado por vez. A seleção de um FL na matriz recalcula o score e os demais painéis.
- Classificação de terreno por FL: VIÁVEL com pelo menos 2.000 ft acima da MORA crítica, MARGINAL com margem menor, INVIÁVEL abaixo da MORA; sem MORA suficiente, TERRENO NÃO AVALIADO. Mínimos ausentes podem ser informados manualmente com fonte verificada.
- Icing-Aware Level Optimizer usando OAT por waypoint/nível e evidências meteorológicas presentes no OFP para evitar ou penalizar faixas com risco de gelo.
- Card ICE dedicado, sincronizado com o FL selecionado, com comparação vertical, exposição por fase, evidências do OFP, faixa dinâmica da rota por waypoint, destino, alternado e saída vertical. A intensidade visual usa uma única escala azul proporcional ao índice; trechos sem evidência permanecem identificados como dados limitados.
- Interface clara e minimalista em português do Brasil e inglês americano, com paleta, tipografia de sistema, ícones e espaçamento compartilhados por toda a calculadora.
- Tipografia compacta e responsiva, com controle A−/A/A+ salvo no dispositivo e unidades selecionáveis LB/KG e GAL/L.
- Manifesto instalável com apresentação standalone, semelhante a um aplicativo.
- Comparação de FL100 a FL250 nos modos ECON, NORMAL e FAST.
- Potência automática por modo ou ajuste manual de MAP/RPM, refletida em TAS, fuel flow, tempo, combustível e alcance.
- Indicador explícito de viabilidade usando combustível, peso, teto e espaço disponível para subida/cruzeiro/descida.
- Lista progressiva de todos os níveis de cruzeiro: cada linha mostra combustível, ETE, TAS e status; a expansão revela gelo, oxigênio e o motivo de restrição. O ETE continua usando GS com o vento previsto. Níveis inviáveis podem ser selecionados para inspeção, mas não são recomendados.
- TAS, GS, ISA deviation, componente de vento, climb/cruise/descent, combustível, endurance e alcance.
- ETP e PNR calculados com velocidades de continuação e retorno corrigidas pelo vento.
- Alternate & Diversion Advisor com distância direta, tempo, consumo, combustível estimado no pouso e viabilidade de reserva.
- Comparador A/B de modo, nível, payload e combustível, com deltas de consumo, tempo, GS e margem.
- Otimizador global no card principal: compara ECON, NORMAL e FAST e aplica automaticamente o preset, FL, combustível, payload, CG e oxigênio que produzam a melhor missão viável.
- Controles permanecem livres após a otimização, com recálculo contínuo de VIÁVEL, MARGINAL ou INVIÁVEL a cada ajuste manual.
- Weight & Balance/CG de cinco assentos com pesos individuais, bagagem, oxigênio, combustível, momentos por estação e gráfico dinâmico da trajetória ZFW–decolagem–pouso dentro do envelope.
- Engine-Out Glide Corridor usando razão de planeio 12,15:1 e 90 KIAS, com alcance corrigido pelo vento ao longo do perfil.
- Cabin Altitude & Oxygen Planner para a configuração personalizada de cinco assentos, com ocupação individual, consumo por altitude, autonomia, saídas disponíveis, recomendação de garrafas e peso dos sistemas no peso de decolagem. A recomendação atende à margem de capacidade de 20% usada pelo Mission Score, considerando até quatro garrafas; troca para outro modelo disponível se o selecionado não alcançar essa margem. Aplicar a recomendação recalcula imediatamente o score, o peso e os demais indicadores. Se nenhuma configuração disponível atender, o botão fica indisponível.
- Mission Score único de 0 a 100, com anel visual, status, três fatores de maior impacto e ajuste principal; limites obrigatórios mantêm a missão abaixo da faixa viável. A seleção manual de FL mostra MANUAL no cabeçalho e usa o score e o índice de gelo desse nível em todos os resumos.
- Performance Confidence Envelope com faixas baixa/esperada/alta para combustível, ETE, TAS e alcance.
- Em Atualização manual, o modo Voo concluído compara tempo e combustível reais com a previsão e mantém o histórico de calibração. Cada registro pode ser excluído; a exclusão atualiza os indicadores e refaz os fatores estimados quando o histórico permite reconstituição exata.
- Turbulence & Ride Comfort Optimizer com exposição por trecho e fase, gradientes de vento, tropopausa, condições no destino/alternado, cobertura das evidências e preferências Padrão, Conforto e Máx. conforto. A preferência recalcula apenas a recomendação; o nível muda somente por ação explícita em `Aplicar recomendação`.
- Step Climb Advisor com pontos vinculados aos waypoints e atualização manual por posição, FL e combustível restante.
- Calibração local por modo usando TAS e fuel flow observados no Xbox, após confirmar posição, FL e combustível restante em Atualização manual; os fatores ficam salvos no dispositivo.
- Atualização manual mostra separadamente a margem estimada de combustível para o trecho restante, incluindo contingência, reserva e alternado quando calculável; ela não substitui o score da missão planejada.
- Gráficos de performance, perfil vertical, representação de rota e perfil de combustível organizados em abas.
- Cada ferramenta de voo tem um card próprio. O módulo escolhido abre logo abaixo de sua linha, no fluxo normal da página, sem painel fixo ou rolagem interna. No aplicativo instalado em dispositivos de toque, a pinça para ampliar a página é desativada e os controles A−/A/A+ continuam disponíveis.
- Tela inicial vazia até a importação de um OFP real; somente o identificador SimBrief é salvo localmente.
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

A viabilidade considera o combustível requerido completo, peso máximo, teto de serviço, espaço para subida/cruzeiro/descida e MORA dos trechos percorridos em cruzeiro entre TOC e TOD. Todos os FLs podem ser selecionados para comparar o efeito sobre combustível, tempo, oxigênio e score; os inviáveis não participam da recomendação ou da otimização. A classificação de terreno permanece não avaliada se faltar MORA em qualquer trecho relevante, mesmo quando outros parâmetros são adequados. Os limites de margem permanecem centralizados em `js/config.js`.

A MORA de cada fix do SimBrief é associada ao trecho que termina nele. Segundo a [explicação da Navigraph](https://forum.navigraph.com/t/ofp-wrong-msa/22775), ela cobre 5 NM de cada lado da rota entre os fixes; não equivale à Grid MORA. A matriz usa o valor exato por trecho e FL, e só mostra a margem sobre MORA na porção de cruzeiro entre TOC e TOD; as cores da célula indicam apenas essa margem, enquanto o score da missão continua separado. O componente do vento é projetado no rumo de cada trecho: positivo em verde, negativo em âmbar, zero em azul e ausente como travessão. A direção e velocidade são interpoladas entre os níveis de vento válidos do OFP; valores ausentes não são tratados como calmaria. O índice de gelo segmentado é exibido somente onde houver evidência aplicável; a ausência de evidência aparece como travessão. Quando a MORA falta, o usuário pode informar para cada trecho uma altitude mínima obtida de uma fonte verificada; o valor e a fonte ficam na sessão e são descartados ao trocar de plano. Trechos de subida e descida exigem análise própria de cartas e procedimentos. O modelo é estimado para simulador, não uma autorização operacional para voo real.

O Icing-Aware Level Optimizer mantém separado o ótimo puro de performance do nível recomendado pela meteorologia e utiliza apenas o OFP do SimBrief. SIGMETs e AIRMETs estruturados são limitados pelo polígono, validade temporal e faixa de altitude: cada aviso é aplicado somente aos trechos e horários em que cruza o voo; avisos sem geometria/validade suficientes permanecem como informação de rota por cautela. Faixas verticais de gelo são lidas mesmo quando aparecem depois de polígonos longos no texto do aviso. Indicações explícitas de gelo ou precipitação congelante tornam incompatíveis os níveis afetados, inclusive durante a passagem pela camada na subida e descida. O índice único `ICE` de cada FL combina a severidade máxima com o tempo estimado de exposição nos trechos com evidência aplicável; a OAT isolada nunca cria uma diferença de risco entre níveis.

METAR e TAF de origem/destino são aplicados somente às transições locais. O TAF é recortado para o horário planejado: `FM` e `BECMG` alteram a condição predominante, enquanto `TEMPO` e `PROB30/40` mantêm seus pesos de incerteza. METAR com mais de três horas de diferença deixa de criar risco e passa a reduzir a cobertura. As bases de nuvem reportadas acima do aeródromo são convertidas para altitude acima do mar usando a elevação do aeroporto no OFP. Nuvens terminais sem topo informado recebem espessura e peso conservadores configuráveis, sem serem estendidas por toda a rota. O destino e o alternado são avaliados separadamente usando o horário estimado, a meteorologia terminal e, quando disponível, o `alternate_navlog`. O card mostra o trecho crítico, duração, cobertura combinada, validade terminal, idade do METAR e o FL avaliado mais próximo que reduza materialmente o índice. O card identifica a qualidade da evidência como `EVIDÊNCIA OFP`, `ESTIMADO` ou `DADOS LIMITADOS`; o número de 0 a 100 é um índice heurístico, não uma porcentagem nem uma probabilidade meteorológica certificada. Quando o SimBrief não fornece informação vertical de umidade/gelo suficiente para distinguir os FLs, números iguais são esperados. A diferença de combustível, tempo, GS e alcance é recalculada pelo modelo no FL alternativo, sem simular voo deliberado com gelo acumulado. Todos os coeficientes do índice ficam em `js/config.js` para calibração manual futura.

O otimizador global testa FL100–FL250 nos três presets com potência automática mesmo quando o ajuste manual atual já é viável. Ele pode aumentar ou reduzir combustível e oxigênio, escolher outro nível e aplicar o melhor ajuste para a finalidade de ECON, NORMAL ou FAST. Mantém a reserva escolhida e a carga real sempre que possível; quando isso não basta, reduz primeiro a bagagem e depois o restante do payload até o limite mínimo do piloto. Se o preset selecionado não oferecer uma solução adequada, troca automaticamente para o preset que preserve mais carga útil e produza um resultado VIÁVEL. A margem-alvo é de 6 gal sobre o requerido e 80 lb abaixo do peso máximo. Se nem a configuração piloto-only atender à missão, o sistema mantém INVIÁVEL em vez de apresentar uma solução artificial. A aplicação é global: CG, gelo, turbulência, oxigênio, risco, perfis, alternativas e demais painéis são recalculados; depois disso, todos os controles continuam disponíveis para ajuste independente.

O Weight & Balance usa os braços de exemplo do manual do Velocity XL N97XL: piloto/copiloto 80 in, passageiros traseiros 124 in, header/sump 145 in, combustível principal 132 in, bagagem/wing strake 115 in e lastro dianteiro 24 in. O terceiro assento traseiro da configuração Black Square foi adaptado no mesmo braço longitudinal de 124 in do banco traseiro; portanto, não há cálculo de equilíbrio lateral. O combustível é separado entre os primeiros 4 gal do header e o volume restante dos tanques principais, e as garrafas de oxigênio entram no braço da área de bagagem. O envelope longitudinal usa 127–134 in e o limite superior de 3.000 lb do addon. Como o manual exige pesagem e braços específicos de cada aeronave experimental, o peso vazio de 1.900 lb foi associado ao CG vazio de exemplo 141,63 in exclusivamente para simulação. Esses parâmetros ficam centralizados em `js/config.js` e não devem ser usados em uma aeronave real.

O Oxygen Planner usa como base internacional o FAA 14 CFR §91.211: tripulação acima de 12.500 ft por mais de 30 minutos, uso contínuo da tripulação acima de 14.000 ft e oxigênio disponibilizado a todos os ocupantes acima de 15.000 ft. A configuração solicitada tem cinco assentos — piloto, copiloto e três passageiros traseiros — e é independente da configuração descrita pelo fabricante do addon. Vazões, capacidades, número de saídas e pesos cheios vêm da documentação Aerox Sky-Ox; cânulas são limitadas a 18.000 ft e o modelo passa a considerar máscaras acima desse nível. A reserva de oxigênio é estimada em 15 minutos. Os valores servem somente para o simulador.

O Ride Comfort Optimizer interpreta menções explícitas a TURB/CAT, AIRMET Tango, SIGMET e tempestades no conteúdo meteorológico de rota, prioriza o campo `shear` de cada fix quando o OFP o fornece e complementa isso com uma estimativa baseada na mudança vetorial do vento entre níveis e trechos. Ele separa exposição em subida, cruzeiro e descida; considera rajadas, LLWS e convecção nos terminais dentro da janela válida; mostra a proximidade da tropopausa quando fornecida pelo navlog; e informa a cobertura dos dados. O `shear` do navlog é válido somente próximo à altitude daquele fix e nunca é replicado por toda a faixa FL100–FL250. Avisos sem limites verticais permanecem como evidência não resolvida, sem fabricar um risco específico para cada nível; somente uma faixa vertical explícita que cubra o FL avaliado ou um `shear` severo aplicável àquele nível pode desabilitá-lo. Objetos não documentados de SIGMET/AIRMET não são convertidos em texto por concatenação de campos. Mudanças entre trechos muito curtos usam uma distância mínima de normalização e a inferência isolada é limitada a MODERADO. METAR/TAF terminal não é extrapolado para o cruzeiro. As preferências de conforto alteram somente o peso usado para recomendar um FL com Mission Score VIÁVEL quando houver algum disponível; não alteram os dados meteorológicos nem o índice RIDE. O Mission Score, o indicador `ICE` e o Performance Confidence Envelope são índices próprios, não probabilidades certificadas. O Mission Score parte de 100 e desconta combustível, peso/CG, perfil vertical, gelo, turbulência, oxigênio, confiança e alternado; qualquer restrição operacional obrigatória limita o resultado a no máximo 39. Entre 40 e 69 pontos o status é MARGINAL; de 70 a 100 é VIÁVEL quando não houver condição operacional marginal. A MORA ausente mantém o terreno não avaliado. Debriefs ficam apenas no `localStorage`, separados por preset e limitados aos 20 registros mais recentes. Os valores reais não são preenchidos pela previsão. Tempo e combustível totais ajustam somente fatores gerais de tempo e combustível, sem alterar a TAS nem atribuir o erro a uma fase. As fases opcionais são registradas em abas compactas e, quando informadas, ajustam separadamente tempo e combustível da subida, cruzeiro e descida; nesse caso os fatores gerais não são alterados para evitar dupla correção. O registro guarda previsão e contexto da configuração usada. A interface mostra um índice estimado de confiança da calibração por preset, calculado com quantidade e erro dos registros recentes, e mantém o histórico recolhido. Ao excluir um registro com instantâneos de calibração contínuos, os fatores posteriores do mesmo preset são refeitos sem ele. Registros antigos sem esses instantâneos, ou com recalibração manual posterior, são retirados do histórico; os fatores existentes permanecem quando não é possível reconstituí-los com segurança.

O mapa preserva a ordem completa dos fixes do navlog do SimBrief, acrescenta origem e destino quando esses aeroportos não vêm repetidos no navlog e mantém todos os waypoints visíveis. TOC e TOD usam diretamente os pontos fornecidos pelo OFP; quando ausentes, são inseridos nas distâncias calculadas pelo modelo. A projeção também normaliza rotas que cruzam a Linha Internacional de Data.

A calibração é separada por ECON, NORMAL e FAST. O usuário seleciona posição, FL e combustível restante, informa TAS e fuel flow estabilizados vistos no Xbox e aplica dois fatores limitados de correção. Nenhum dado é transmitido; a calibração usa `localStorage` no navegador.

O endpoint público permite buscar um OFP já gerado. O usuário gera o voo no SimBrief e depois informa o Pilot ID ou Navigraph Alias no planner. Tipo de aeronave, pesos, TAS, GS, tempos, combustível, TOC e TOD fornecidos pelo SimBrief não entram no cálculo do Velocity XL.

## Licença

MIT
