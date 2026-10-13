# Velocity XL Performance Planner

Dashboard gráfico, bilíngue e responsivo de planejamento pré-voo para o **Black Square Velocity XL** no Microsoft Flight Simulator. O aplicativo importa o OFP mais recente do SimBrief e cruza a rota e a atmosfera com um modelo próprio de performance da aeronave.

> **Aviso:** estimativas para simulação, não certificadas. Não use para voo real. O aplicativo não usa SimConnect nem telemetria do Xbox.

## Recursos

- Importação por SimBrief Pilot ID ou Navigraph Alias usando o endpoint oficial `xml.fetcher.php` com `json=v2`.
- Uso exclusivo da rota, dos waypoints e dos dados atmosféricos do OFP; o tipo e os cálculos de aeronave do SimBrief são ignorados.
- Interpolação de vento e OAT por waypoint para comparar FL100 a FL250.
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
- Preflight Load Optimizer por preset: procura automaticamente um FL viável, combustível e payload para ECON, NORMAL ou FAST.
- Engine-Out Glide Corridor usando razão de planeio 12,15:1 e 90 KIAS, com alcance corrigido pelo vento ao longo do perfil.
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

O manual informa 400 hp, twin turbo, altitude crítica de 24.000 ft, teto de serviço de 25.000 ft, 92 gal totais/87 úteis, peso vazio de 1.900 lb e peso máximo de 3.000 lb. Também informa 32 inHg e 2.700 RPM como limites, Maximum Continuous em subida, 2.650 RPM na subida inicial, 2.600 RPM em enroute climb e 2.450 RPM em cruzeiro. O controlador absoluto é modelado mantendo aproximadamente 29,6 inHg até a altitude crítica de densidade, com redução de MAP disponível acima dela.

Os presets estimados são ECON 20 inHg/2.300 RPM, NORMAL 24 inHg/2.450 RPM e FAST 28 inHg/2.500 RPM. No modo manual, MAP e RPM modificam a potência estimada; a TAS varia pela aproximação de potência cúbica e o fuel flow acompanha a potência. Esses coeficientes não substituem uma tabela MAP/RPM do fabricante e continuam centralizados em `js/config.js` para calibração. ETP, PNR e step climbs são referências de planejamento para simulação e não procedimentos certificados.

O Alternate & Diversion Advisor usa as coordenadas do alternado quando fornecidas pelo OFP; sem coordenadas, o cálculo fica indisponível. O combustível até o alternado inclui estimativas centralizadas de arremetida e aproximação. O Glide Corridor assume altitude sobre o nível do mar, não considera relevo, obstáculos, razão de planeio degradada, configuração, falhas adicionais ou locais de pouso; serve exclusivamente como referência visual para o simulador.

A viabilidade considera o combustível requerido completo, peso máximo, teto de serviço e a distância necessária para subida e descida. Um nível marginal continua selecionável; um nível inviável é desabilitado e não participa da recomendação. Os limites de margem permanecem centralizados em `js/config.js`.

O Load Optimizer testa FL100–FL250 com a potência automática do preset selecionado, preserva o máximo de payload possível e aplica nível, combustível e carga com margem-alvo de 6 gal sobre o requerido e 80 lb abaixo do peso máximo. A aplicação só fica indisponível quando nenhuma combinação física entre zero payload e 87 gal torna a missão viável.

A calibração é separada por ECON, NORMAL e FAST. O usuário seleciona posição, FL e combustível restante, informa TAS e fuel flow estabilizados vistos no Xbox e aplica dois fatores limitados de correção. Nenhum dado é transmitido; a calibração usa `localStorage` no navegador.

O endpoint público permite buscar um OFP já gerado. O usuário gera o voo no SimBrief e depois informa o Pilot ID ou Navigraph Alias no planner. Tipo de aeronave, pesos, TAS, GS, tempos, combustível, TOC e TOD fornecidos pelo SimBrief não entram no cálculo do Velocity XL.

## Licença

MIT
