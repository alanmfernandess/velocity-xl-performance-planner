# Velocity XL Performance Planner

Planejador visual para o **Black Square Velocity XL** no Microsoft Flight Simulator 2024. Importa o OFP mais recente do SimBrief por Pilot ID ou alias, utiliza a rota e os dados meteorológicos disponíveis e produz uma recomendação integrada no preset **ECON, NORMAL ou FAST** escolhido pelo usuário.

**Somente para simulação.** O modelo é estimado e não certificado; não avalia separação do terreno ou obstáculos. Não usa SimConnect nem telemetria do Xbox.

## Fluxo

1. Importe um OFP do SimBrief.
2. Informe carga, combustível, reserva, oxigênio e, se desejar, preço do combustível.
3. Escolha ECON, NORMAL ou FAST e use **Otimizar missão**.
4. Revise FL, combustível recomendado, ETE, potência por fase, Mission Score e as limitações exibidas.
5. Use **Aplicar configuração** para gravar explicitamente o combustível e o FL recomendados. Ocupantes, bagagem, preset e cilindros não são alterados automaticamente.

A interface mantém quatro áreas: **Missão** (resultado e score), **Planejamento** (configuração, otimização, W&B, oxigênio e custos), **Rota & riscos** (ICE, RIDE, ETP/PNR, alternado/desvio, GLIDE e step climb) e **Em voo** (posição, combustível restante e calibração de cruzeiro). A atualização em voo não reclassifica retroativamente a missão planejada.

## Motor integrado

`js/unified-optimization.js` avalia FL100–FL250 com o preset selecionado e devolve um único `optimizedMission`. Cada candidato reúne `calculateAtAltitude` e os módulos de gelo, turbulência, W&B, oxigênio, alternado, ETP/PNR, GLIDE, custo e Mission Score. Restrições físicas são classificadas antes das preferências de combustível, tempo, alcance e conforto. A recomendação global pode diferir do melhor FL para ICE e do melhor FL para RIDE. A configuração da tripulação e da bagagem permanece a informada pelo usuário.

O combustível recomendado resolve iterativamente o efeito do próprio combustível no peso e na performance, visando a margem configurada em `js/config.js`, até o limite utilizável. Se não houver solução viável, o estado permanece **INVIÁVEL**. Se faltarem evidências meteorológicas essenciais, o estado é **NÃO AVALIADO**, mesmo com pontuação numérica alta. O terreno e os obstáculos são sempre identificados como não avaliados.

O perfil estimado possui, para cada fase, MAP, RPM, potência estimada, duração, distância e consumo. TAS, GS e fuel flow de cruzeiro são calculados com altitude, temperatura, peso, potência e vento por trecho. Subida e descida usam hipóteses de fase centralizadas em `js/config.js`; a fonte técnica não fornece uma tabela completa de MAP/RPM por preset e fase. Por isso, os presets diferenciam principalmente o cruzeiro, enquanto as hipóteses comuns de subida e descida permanecem explícitas. Não apresentamos essas hipóteses como tabela de performance certificada.

O **Mission Score** parte de 100 e desconta margem de combustível, limites de perfil, W&B, oxigênio, ICE, RIDE, alternado, eficiência e custo quando houver preço. Motivos e impactos acompanham o resultado. Restrições impeditivas limitam a pontuação a 39; o status operacional também considera condições marginais e falta de evidência, independentemente do número. MORA e Confidence Envelope não entram na fórmula.

## Calibração

Em cruzeiro estabilizado, o usuário informa no módulo **Em voo** posição, FL e combustível restante, seguidos apenas de **TAS observada** e **Fuel Flow observado**. O OFP precisa fornecer temperatura no ponto escolhido. O motor calcula:

- `K1 = TAS observada / TAS prevista`
- `K2 = GPH observado / GPH previsto`

Os fatores têm limites matemáticos em `js/config.js`, ficam salvos no `localStorage` e podem ser redefinidos. O contexto de referência guarda preset, FL, MAP, RPM, temperatura e peso estimado. A calibração só se aplica próxima desse regime; ela corrige o cruzeiro, sem alterar diretamente MAP/RPM nem calibrar subida ou descida. Calibrações antigas com K1/K2 válidos são migradas; os registros antigos de Debrief não são apagados, embora o módulo tenha sido removido do fluxo.

## Limitações dos módulos

- **ICE/RIDE:** índices heurísticos extraídos da evidência do OFP; dados ausentes permanecem desconhecidos. O índice de gelo não é probabilidade certificada.
- **ETP/PNR:** integra ventos e tempos por trecho quando o navlog fornece coordenadas e distâncias; lacunas usam a média da rota. Reserva, subida, descida e consumo estimado participam do PNR.
- **GLIDE:** alcance e tempo teóricos. Altitude MSL não indica altura livre sobre o terreno; nenhum local de pouso é classificado como seguro.
- **Alternado/desvio:** requer coordenadas ou distância utilizável; estima tempo, combustível e margem no pouso.
- **Financeiro:** depende do preço por litro informado manualmente em BRL ou USD. Preço ausente produz custo indisponível, nunca custo zero.
- **Persistência:** preferências e calibração são locais ao navegador/dispositivo. A configuração aplicada é restaurada somente para o mesmo OFP e preset.

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
```

A auditoria de navegador usa um OFP **sintético**, com números ilustrativos, em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px. As capturas e o relatório ficam em `review/`.

## Fontes técnicas

- [SimBrief — Fetching a User's Latest OFP Data](https://developers.navigraph.com/docs/simbrief/fetching-ofp-data)
- [Navigraph — formato JSON v2 do fetcher](https://forum.navigraph.com/t/fetching-a-users-latest-ofp-data/5297)
- [Black Square Velocity XL User Guide](https://downloads.justflight.com/products/JFF003720/BKSQ_VelocityManual.pdf)

O manual documenta os limites do motor e procedimentos gerais; os coeficientes de TAS, consumo e fases do aplicativo são estimativas configuráveis em `js/config.js`. Os dados de performance de uma aeronave experimental específica devem ser calibrados no simulador, pois esta aplicação não possui telemetria.

## Licença

MIT
