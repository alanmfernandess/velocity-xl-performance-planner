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
- Best Overall, Lowest Fuel, Fastest e Maximum Range.
- TAS, GS, ISA deviation, componente de vento, climb/cruise/descent, combustível, endurance e alcance.
- ETP e PNR calculados com velocidades de continuação e retorno corrigidas pelo vento.
- Step Climb Advisor com pontos vinculados aos waypoints e atualização manual por posição, FL e combustível restante.
- Calibração local por modo usando somente TAS e fuel flow observados no Xbox; os fatores ficam salvos no dispositivo.
- Gráficos de performance, perfil vertical, representação de rota e perfil de combustível organizados em abas.
- Dados demonstrativos e armazenamento local do identificador SimBrief.
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

O manual informa 400 hp, twin turbo, altitude crítica de 24.000 ft, teto de serviço de 25.000 ft, 92 gal totais/87 úteis, peso vazio de 1.900 lb e peso máximo de 3.000 lb. As curvas de velocidade e consumo são aproximações explícitas, ajustáveis no arquivo de configuração. ETP, PNR e step climbs são referências de planejamento para simulação e não procedimentos certificados.

A calibração é separada por ECON, NORMAL e FAST. O usuário seleciona posição, FL e combustível restante, informa TAS e fuel flow estabilizados vistos no Xbox e aplica dois fatores limitados de correção. Nenhum dado é transmitido; a calibração usa `localStorage` no navegador.

O endpoint público permite buscar um OFP já gerado. O usuário gera o voo no SimBrief e depois informa o Pilot ID ou Navigraph Alias no planner. Tipo de aeronave, pesos, TAS, GS, tempos, combustível, TOC e TOD fornecidos pelo SimBrief não entram no cálculo do Velocity XL.

## Licença

MIT
