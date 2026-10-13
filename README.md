# Velocity XL Performance Planner

Dashboard gráfico, bilíngue e responsivo de planejamento pré-voo para o **Black Square Velocity XL** no Microsoft Flight Simulator. O aplicativo importa o OFP mais recente do SimBrief ou recebe uma rota direta na própria tela e cruza esses dados com um modelo próprio de performance da aeronave.

> **Aviso:** estimativas para simulação, não certificadas. Não use para voo real. O aplicativo não usa SimConnect nem telemetria do Xbox.

## Recursos

- Importação por SimBrief Pilot ID ou Navigraph Alias usando o endpoint oficial `xml.fetcher.php` com `json=v2`.
- Planejamento direto por origem, destino, distância, nível e atmosfera, sem sair da calculadora.
- Interface clara e minimalista em português do Brasil e inglês americano.
- Comparação de FL100 a FL250 nos modos ECON, NORMAL e FAST.
- Best Overall, Lowest Fuel, Fastest e Maximum Range.
- TAS, GS, ISA deviation, componente de vento, climb/cruise/descent, combustível, endurance e alcance.
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
- [Manual Black Square Velocity XL](https://downloads.justflight.com/products/JFF003720/BKSQ_VelocityManual.pdf)

O manual informa 400 hp, twin turbo, altitude crítica de 24.000 ft, teto de serviço de 25.000 ft, 92 gal totais/87 úteis, peso vazio de 1.900 lb e peso máximo de 3.000 lb. As curvas de velocidade e consumo são aproximações explícitas, ajustáveis no arquivo de configuração.

O endpoint público permite buscar um OFP já gerado. A geração de um novo OFP a partir de origem e destino exige o fluxo oficial de dispatch e uma API key do SimBrief; por isso, o modo de rota direta calcula a performance localmente sem criar ou alterar um plano no SimBrief.

## Licença

MIT
