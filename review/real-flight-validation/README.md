# Validação do voo real — BIIS → BIAR

**Branch:** `fix/ice-weather-coverage-diagnostics`

**Data da validação:** 22/10/2026

**Origem dos dados:** último OFP JSON v2 retornado pelo SimBrief para o Pilot ID já salvo no navegador local. Nenhum voo de demonstração foi usado.

## OFP importado

| Campo | Valor observado |
| --- | --- |
| ID do OFP | `190608493` |
| Origem / destino / alternado | BIIS / BIAR / BIKF |
| Rota planejada | 139 NM; FL90; 7 trechos entre 8 pontos de navegação |
| Horários planejados | 21/10/2026, saída 22:05 UTC; chegada 22:52 UTC |
| Geração do OFP | 21/10/2026 21:14:35 UTC |
| Alternado | BIKF, aproximadamente 196 NM de BIAR |

| Ponto | Latitude | Longitude | Altitude no OFP |
| --- | ---: | ---: | ---: |
| IS401 | 66.112092 | -23.059325 | 2.600 ft |
| IS402 | 66.092725 | -22.823097 | 7.200 ft |
| TOC | 66.056721 | -22.737665 | 9.000 ft |
| RE | 65.926472 | -22.431528 | 9.000 ft |
| ABTAR | 65.854931 | -20.932389 | 9.000 ft |
| TOD | 65.833477 | -20.079282 | 9.000 ft |
| AFPAC | 65.793092 | -18.821139 | 3.500 ft |
| BIAR | 65.656667 | -18.071944 | 2.500 ft |

O navlog contém perfis de vento e temperatura em dez níveis por ponto. Há METAR e TAF para origem, destino e alternado. O OFP não trouxe SIGMET ou PIREP em rota nem pontos detalhados do desvio.

## Fontes e cobertura ICE

| Fonte | Estado constatado | Aplicabilidade ao horário do voo |
| --- | --- | --- |
| SimBrief | OFP JSON v2 real importado; OAT nos sete trechos, aproximadamente −14 a −13 °C; dados terminais presentes | Temperatura e TAF/METAR terminal não comprovam umidade/nuvens em toda a rota; 2/3 terminais passaram pelo critério de validade no momento da análise. |
| Open-Meteo / GFS | Resposta recebida para quatro locais | Primeira hora da previsão: **22/10/2026 00:00 UTC**, após a chegada planejada de **21/10/2026 22:52 UTC**. Nenhuma das 23 amostras da trajetória tem previsão temporal aplicável. |
| AWC SIGMET | Snapshot local recebido, mas vencido (cerca de 138 min na primeira consulta); 136 entradas no arquivo | Nenhuma entrada desse snapshot foi aceita como evidência aplicável. Não é possível inferir ausência de risco. |
| AWC PIREP | Snapshot com zero entradas | A área consultada para PIREP cobre aproximadamente −130° a −50° de longitude e 20° a 65° de latitude; não cobre a rota islandesa. |

| Cobertura | Amostras avaliadas |
| --- | ---: |
| Subida | 0/7 |
| Cruzeiro | 0/9 |
| Descida | 0/7 |
| Trajetória total | 0/23 (0%) |
| Trechos com evidência ICE aplicável | 0/7 |
| Desvio ao alternado BIKF | 0/21 |

O motivo técnico predominante é `OUTSIDE_FORECAST_WINDOW` nas 23 amostras da rota. O 0/7 é, portanto, **ausência de cobertura meteorológica aplicável**, não índice de gelo zero. A faixa térmica de 7/7 trechos frios usa a OAT do OFP e é rotulada como tal, sem ser apresentada como cobertura de nuvens/umidade. O alternado BIKF possui TAF/METAR terminal, mas a trajetória do desvio continua sem cobertura ICE.

## Resultado da missão e correção

Antes da correção, a interface mostrava **MARGINAL, 77 pontos, FL100 e ICE 35/100**, apesar de 0/7 trechos e 0/23 amostras ICE avaliados. Um TAF terminal válido permitia indevidamente classificar a rota e o desvio não cobertos.

Após a correção, a missão aparece como **NÃO AVALIADO**, sem pontuação nem nível recomendado. FL100 é identificado apenas como **diagnóstico**; a ação de aplicar recomendação fica desabilitada. O índice ICE da rota e o ICE do alternado aparecem como `—`, com a causa temporal, a cobertura por fase/trecho e o estado das fontes visíveis. Não foi forçada a classificação VIÁVEL. Os números de performance restantes continuam sendo estimativas do modelo, sem representar aprovação operacional da missão.

## Interface e testes

- [Missão no desktop, 1440 px](desktop-mission.jpg)
- [ICE no desktop, 1440 px](desktop-ice.jpg)
- [Missão no celular, 390 px](mobile-mission.jpg)
- [Missão no celular, viewport](mobile-mission-viewport.jpg)
- [ICE no celular, 390 px](mobile-ice.jpg)
- [Cobertura ICE no celular, viewport](mobile-ice-evidence-viewport.jpg)
- [Alternado e fontes no celular, viewport](mobile-ice-alternate-viewport.jpg)

Após reimportar o OFP no navegador local, o console não apresentou erros JavaScript. Largura do documento: 1440 px no desktop de 1440 px e 390 px no celular de 390 px, sem overflow horizontal. A inspeção visual não encontrou componentes sobrepostos nem mensagens que tratem GFS recebido como cobertura suficiente. A barra inferior fixa visível no meio de capturas de página inteira é um artefato da costura do navegador; as capturas de viewport mostram sua posição real.

`npm test`: **103/103 testes aprovados**, inclusive regressão para OFP anterior à janela GFS e TAF terminal válido. `npm run validate:missions`: **11 cenários validados**, 6 corretamente sem recomendação. `git diff --check`: sem problemas.

## Limitações remanescentes

- O workflow do snapshot AWC estava ativo, mas a listagem de execuções mostrava apenas uma execução manual e nenhuma agendada até esta validação. O snapshot permanece vencido; isso depende da atualização do dado externo.
- O recorte atual de PIREP do AWC não cobre a Islândia. Mesmo com snapshot atualizado, essa consulta não demonstraria ausência de PIREP na rota.
- A API de previsão GFS consultada não oferece, neste momento, evidência para o horário já transcorrido desse OFP. Um novo OFP com horário dentro da janela de previsão pode produzir outra cobertura e outra classificação.

Não houve merge na `main`.
