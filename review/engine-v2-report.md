# Velocity XL Performance Planner — Engine 2.0

Relatório de engenharia da branch `feature/unified-mission-engine-v2`, integrada à `main` após aprovação visual.
Base: `38da61c61fb00fb796d30a3125d2ba1b9c444f4d` (`fix/definitive-ui-quality`).
Todos os OFPs e dados nos cenários automatizados são **sintéticos e ilustrativos**. O produto continua sendo uma estimativa para simulador, sem certificação aeronáutica.

## 1. Arquitetura implementada

`parseSimBrief` normaliza o OFP JSON v2. `fetchGfsSnapshot` consulta um lote de pontos da rota, incluindo o alternado quando possui coordenadas. `fetchAwcSnapshot` lê o JSON publicado pelo workflow, sem chamada AWC direta no navegador. `createWeatherSnapshot` fixa as fontes para uma execução; `weatherAt` interpola o GFS por tempo, altura geopotencial e posição, conserva as evidências AWC e usa o OFP quando faltam valores numéricos. `optimizeMission` calcula nove candidatos FL100–FL250 com o mesmo snapshot. Cada candidato contém performance, trajetória 4D, ICE, RIDE, elegibilidade, score e módulos auxiliares. A interface só permite aplicar uma solução válida por comando explícito.

## 2. Arquivos

Novos: `js/weather/open-meteo.js`, `js/weather/awc.js`, `js/weather/fusion.js`, `js/weather/exposure.js`, `js/trajectory.js`, `js/mission-score-v2.js`, `scripts/update-awc-snapshot.mjs`, `scripts/verify-weather-live.mjs`, `scripts/validate-missions.mjs`, `.github/workflows/awc-snapshot.yml`, `tests/weather-v2.test.mjs` e fixtures de GFS/AWC.

Modificados: `js/simbrief.js`, `js/engine.js`, `js/unified-optimization.js`, `js/app.js`, `js/config.js`, `index.html`, `package.json`, `scripts/audit-browser.mjs`, `tests/unified-optimization.test.mjs` e `README.md`. Os arquivos de produção do design system não foram alterados.

## 3. Integrações e endpoints

| Fonte | Endpoint efetivamente usado | Estado verificado | Uso |
| --- | --- | --- | --- |
| SimBrief | `https://www.simbrief.com/api/xml.fetcher.php?userid=…&json=v2` | Resposta real JSON v2 verificada uma vez com o Pilot ID informado anteriormente pelo usuário; não incluída no repositório | OFP, rota, navlog, vento, temperatura e avisos presentes |
| Open-Meteo | `https://api.open-meteo.com/v1/gfs` | HTTP 200 e CORS no navegador verificados; fixture real reduzida | GFS global, níveis de pressão, CAPE, congelamento e precipitação |
| AWC upstream | `https://aviationweather.gov/api/data/sigmet?format=json` e `/pirep?format=json&bbox=-130,20,-50,65` | Consulta real HTTP 200/204 e execução local do gerador verificadas | SIGMET global do feed e PIREP da região declarada |
| AWC frontend | `https://raw.githubusercontent.com/alanmfernandess/velocity-xl-performance-planner/weather-snapshots/awc/latest.json` | HTTP 200, CORS `*` e snapshot recente verificados em 22/10/2026 | Leitura estática publicada pelo workflow |

O workflow agendado a cada 30 minutos cria uma branch de dados de um único commit corrente, evitando crescimento histórico. GitHub Pages usa `main`/raiz. A primeira execução manual do workflow [foi concluída](https://github.com/alanmfernandess/velocity-xl-performance-planner/actions/runs/39832564723) após a integração. O teste de navegador ainda usa uma resposta AWC sintética para manter a validação reproduzível.

## 4. Limitações das APIs

SimBrief fornece o último OFP, cuja disponibilidade, estrutura opcional e idade dependem do usuário. Não há garantia de umidade por nível, gelo observado nem unidade confirmada para `shear`. Open-Meteo é previsão numérica: nuvens, umidade e movimento vertical não medem água líquida super-resfriada ou EDR; períodos, alturas e regiões fora do modelo retornam valores ausentes. A modalidade gratuita requer observar as condições de uso não comercial e atribuição do fornecedor. AWC não oferece CORS ao navegador; PIREP não tem cobertura global, ausência de aviso não implica ausência de perigo, e um snapshot vencido é rejeitado. METAR/TAF são usados do OFP; o workflow não baixa um arquivo global de aeroportos porque isso ampliaria solicitações e volume sem rota conhecida.

## 5. Performance

Subida e descida são integradas em intervalos de 1000 ft, com potência disponível, MAP/RPM, temperatura, peso que varia pelo consumo, vento e elevação dos aeródromos. Cruzeiro integra os trechos com variação de peso, TAS, componente de vento, GS, tempo e fuel flow. A soma de distância, tempo e combustível das fases é verificada por testes. O combustível recomendado é resolvido em incrementos de 0,5 gal; ciclos de arredondamento mantêm o valor conservador, sem produzir falso erro de convergência. Os coeficientes ficam em `js/config.js`, inclusive as heurísticas 2.0. O manual Black Square confirma 400 hp, altitude crítica de 24.000 ft e teto de serviço de 25.000 ft, mas não contém tabelas completas de MAP/RPM/FF para validar todos os presets e fases. K1/K2 permanecem locais ao regime de cruzeiro observado.

## 6. ICE

Cada amostra da subida, cruzeiro, descida e trajetória estimada ao alternado combina temperatura, umidade, nuvem, precipitação, avisos e duração. O resultado separa exposição por fase, trechos, índice estimado, cobertura, evidências e limitação. SIGMET de gelo que cruza a trajetória em horário, altitude e polígono válidos é impeditivo, inclusive na subida ou no alternado. `LOW_EXPOSURE_ESTIMATED` significa exposição baixa estimada, nunca ausência garantida; lacunas essenciais produzem `UNKNOWN`. Os limites heurísticos são parâmetros de simulação, não tolerâncias certificadas.

## 7. RIDE

O índice estimado utiliza gradientes vetoriais vertical e horizontal, CAPE, movimento vertical, avisos e tempo de exposição. Evidência severa aplicável é impeditiva; risco leve/moderado pesa na preferência. A trajetória ao alternado também é examinada. O campo `shear` do navlog SimBrief não gera severidade automática porque sua unidade não foi confirmada. O modelo não fornece EDR quantitativo observado.

## 8. Mission Score 2.0

`score = round(100 − Σ penalidade_i)`, com `0 ≤ penalidade_i ≤ peso_i`. Pesos: ICE 35, RIDE 20, combustível 15, perfil/performance 10, W&B 5, O₂ 5, alternado 5, eficiência/custo 5; total 100. Custo só é avaliado com preço manual positivo. O resultado guarda dimensões, valores, evidência, limitações e motivos. Se uma dimensão essencial não tem evidência, a UI mostra score indeterminado. Score alto nunca remove bloqueio físico ou meteorológico.

## 9. Elegibilidade

`INCOMPATIBLE` cobre combustível/capacidade, peso/CG, oxigênio, perfil, ICE, RIDE severo e alternado impeditivo. `UNKNOWN` cobre dados essenciais ausentes. `MARGINAL` cobre margens ou exposições cautelares. `ELIGIBLE` requer ausência desses estados. Se todos os nove candidatos são incompatíveis, `selected=null`, `viabilityStatus=NO_FEASIBLE_SOLUTION`, FL principal “—” e o botão Aplicar fica desabilitado; os candidatos continuam disponíveis para diagnóstico.

## 10. Ranking e contrato único

O ranking ordena primeiro estado operacional, depois score, preferência do preset e FL para desempate. ECON enfatiza combustível e alcance; FAST enfatiza tempo; NORMAL equilibra tempo, combustível e conforto. ICE e restrições são avaliados antes dessas preferências. `optimizedMission` contém `version`, `ofpId`, `weatherSnapshot`, nove `candidates`, conjuntos `eligible/unknown/incompatible`, `selected` opcional, `diagnostic`, `viabilityStatus`, `missionScore`, `reasons`, `limitations`, perfis de potência, W&B, O₂, alternado, ETP/PNR, GLIDE e custos. As rotinas auxiliares recebem o mesmo candidato escolhido/diagnóstico; um diagnóstico não vira recomendação aplicável.

## 11. Missões de validação

Saída completa reproduzível: [`engine-v2-scenarios.json`](engine-v2-scenarios.json). Os números abaixo são **ilustrativos**, obtidos de OFP/GFS/AWC sintéticos. `—` significa nenhum FL aplicável ou score indeterminado.

| Cenário | FL | ETE min | Fuel gal | Score | Estado |
| --- | ---: | ---: | ---: | ---: | --- |
| Curto, céu favorável | 140 | 54 | 30,62 | 100 | Viável |
| Longo, vento contrário | — | 278 | 102,25 | 67* | Sem solução |
| Longo, vento de cauda | 180 | 186 | 72,89 | 97 | Marginal |
| Gelo em níveis intermediários | 140 | 84 | 40,10 | 100 | Viável no nível desviado da camada |
| SIGMET de gelo na subida | — | 84 | 40,16 | 65* | Sem solução |
| RIDE moderado | 120 | 84 | 40,12 | 96 | Viável no nível preferido |
| SIGMET de turbulência severa | 140 | 84 | 40,10 | 100 | Quatro FLs excluídos |
| Cobertura insuficiente | —** | 84 | 40,16 | — | Desconhecido |
| Capacidade de combustível | — | 371 | 132,08 | 67* | Sem solução |
| Peso incompatível | — | 88 | 43,84 | 84* | Sem solução |
| Alternado inadequado | — | 84 | 40,47 | 95* | Sem solução |

\* Pontuação apenas diagnóstica do candidato rejeitado, nunca apresentada como viabilidade. \** O JSON conserva FL160 como candidato exploratório, mas a interface não o mostra como recomendação nem permite aplicá-lo. Cada cenário registra preset, nove candidatos, exclusões, fonte meteorológica, MAP/RPM, ICE, RIDE, motivos e limitações no JSON.

## 12. Testes

`npm test`: 99 testes passando, incluindo propriedades físicas, calibração K1/K2, contrato GFS com fixture real, SIGMET AWC com fixture real, trajetória, bloqueios e ausência de solução. `npm run lint:css`: 834 regras, 2615 declarações, zero problemas. `npm run validate:missions`: onze cenários passando. `npm run audit:browser:v2`: 339 estados em oito larguras, sem falhas, com 46 capturas; dados detalhados no JSON de auditoria. `npm run verify:weather-live`: verificação opcional de rede, sem polling de SimBrief quando o identificador não é fornecido. O registro pré-publicação está em [`engine-v2-live-verification.log`](engine-v2-live-verification.log); após a publicação, o snapshot AWC foi lido com estado `available`, 136 SIGMETs e idade de um minuto. Um teste do site público em 1440 px e 390 px retornou HTTP 200, sem erro JavaScript nem overflow horizontal.

## 13. Evidência em navegador

Os arquivos em [`engine-v2/`](engine-v2/) são capturas reais do Chromium da interface executável, com respostas meteorológicas sintéticas indicadas no relatório. Exemplos: `desktop-mission-overview.png`, `tablet-planning-optimize.png`, `mobile-route-ice-full.png`, `mobile-icing-no-solution.png`. O relatório de dimensões, navegação e erros está em [`engine-v2-browser-audit.json`](engine-v2-browser-audit.json). As capturas da versão base permanecem em [`definitive-after/`](definitive-after/) para comparação; o CSS visual não foi modificado nesta branch.

## 14. Pendências externas e limites restantes

O snapshot AWC está publicado, mas sua disponibilidade depende do GitHub Actions; quando indisponível ou vencido, a interface identifica a lacuna. O GFS não cobre necessariamente todas as amostras, principalmente fora do prazo de previsão. Previsão de gelo e RIDE continua heurística; o alternado usa um perfil intermediário estimado a partir da distância e tempo do desvio. ETP/PNR usam o modelo de performance e ventos da rota, mas não substituem cálculo operacional certificado. Terreno e obstáculos continuam não avaliados. Não há telemetria; a calibração depende de observações inseridas pelo usuário.

## 15. Reprodução e publicação

```bash
npm ci
npm test
npm run validate:missions
npm run audit:browser:v2
npm run verify:weather-live
npm run serve
```

Abra `http://localhost:4173/` para a prévia local ou o [site público](https://alanmfernandess.github.io/velocity-xl-performance-planner/). A versão aprovada `fc9adb2` foi integrada à `main` em 22/10/2026. O GitHub Pages concluiu a publicação desse commit; `index.html`, `js/app.js` e `styles.css` servidos pelo site corresponderam exatamente aos arquivos locais. O workflow AWC foi executado e o snapshot resultante foi validado como disponível.
