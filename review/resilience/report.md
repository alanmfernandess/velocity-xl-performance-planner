# Velocity Mission Intelligence — Resilience Engine

Entrega local na branch `feature/mission-intelligence-resilience`, baseada em `main`/`d7976b1`. **Sem push, PR, merge ou deploy.** A versão pública não foi substituída.

## Abrir e avaliar

Com o servidor local ativo:

- [Prévia navegável isolada](http://localhost:4173/review/resilience/preview.html).
- [Aplicação normal](http://localhost:4173/), para importar um OFP do usuário.

A prévia possui identificação global **DEMO**, OFP e atmosfera ilustrativos, interceptação das fontes externas e armazenamento apenas em memória no iframe. Não grava calibração, preferências ou Tracker no armazenamento da aplicação normal. Não é uma validação de um voo real.

## Mudanças

O Resilience Lab fica em **Missão → Visão geral**, após Mission Profile. Suas cinco análises compartilham o estado 4D, o avaliador e os parâmetros de performance existentes. Só a análise selecionada fica expandida; seleção mobile em 2 + 2 + 1. Mantidos os quatro KPIs, Top 3, Mission Profile, Mission Score, Advisor e as quatro áreas.

- **Stress Test:** vento vetorial, bagagem adicional, temperatura, combustível a bordo e ETD; margens físicas, restrição dominante e fronteiras por varredura/refinamento. Cada parâmetro separa label, valor e slider. Alterações de combustível/carga não são convertidas em abastecimento automático nem reescrevem os ocupantes.
- **Ensemble:** download explícito de membros reais ECMWF IFS, identidade por membro em todas as posições/níveis/horários, solução temporal por membro, percentis R7 e contagens de margem negativa/marginal. Estados incompatíveis e desconhecidos continuam visíveis. Não são probabilidades de segurança.
- **Corredor 4D:** seleção de qualquer waypoint real, estado projetado e opções de continuação, retorno pela rota inversa e desvio direto ao alternado documentado. Combustível suficiente não declara pista/terreno seguros. Altitude do alternado passa a ser preservada quando o OFP a informa; ausências permanecem desconhecidas.
- **Causal:** diferenças centrais/unilaterais dentro dos domínios, efeitos individuais, combinação reavaliada e termo de interação. Cadeia de impacto usa somente TAS, TOC/TOD, vento, duração e consumo efetivamente calculados.
- **Otimizador dinâmico:** busca em grafo limitada com FL/regime por trechos, step climbs físicos, consumo/tempo/massa, restrições e soluções Pareto. A proposta pode ser visualizada no Mission Profile; não há botão de aplicação automática.

Prévia de Stress ou perfil dinâmico usa a mesma área suave, consultas e suavização de forma preservada do Mission Profile. **Original** restaura a visualização. O Advisor recebe evidências do Lab com prefixo LAB; o score da missão aplicada não é substituído.

## Arquitetura

A auditoria anterior às mudanças está em [architecture.md](architecture.md).

| Responsabilidade | Implementação |
|---|---|
| Cenário, estado 4D e cache | `js/resilience/core.js` |
| Fronteiras e restrições | `js/resilience/stress.js` |
| Download, normalização e estatística de membros | `js/resilience/ensemble.js` |
| Estados e opções por waypoint | `js/resilience/corridor.js` |
| Diferenças finitas e interações | `js/resilience/sensitivity.js` |
| Integração física das transições e TOD | `js/resilience/transitions.js` |
| Busca sequencial e Pareto | `js/resilience/dynamic.js` |
| Priorização de evidências | `js/resilience/advisor.js` |
| Execução e transporte em segundo plano | `js/resilience/worker.js`, `transfer.js` |
| Interface, idiomas, unidades e seleção | `js/resilience-view.js` |

Não há cinco modelos de consumo. O cenário usa `evaluateMissionAlternative` com política explícita **FIXED**. O solver padrão de combustível recomendado continua separado e inalterado em seu funcionamento. Subida, descida, cruzeiro, potência, calibração, reservas, W&B, O₂, ICE, RIDE, alternado, ETP/PNR e GLIDE reutilizam as funções existentes.

`planWithForecast()` deixou de distribuir o tempo do OFP proporcionalmente pela distância. Sua semente usa os tempos integrados de um perfil físico de referência; os 27 candidatos mantêm o avaliador/ranking existentes. Cada cenário do Lab resolve seu próprio acoplamento 4D posteriormente.

## Equações e hipóteses novas

- Estado consultável: `(d, h, UTC, F)`, acompanhado por posição, massa, fase, potência, fonte e cobertura. Consumo/tempo são interpolados nas seções reais do motor, nunca linearizados globalmente.
- Triângulo do vento para manter o curso: `GS = sqrt(TAS² − crosswind²) + longitudinal`. Sem GS mínima artificial nos cenários. Vento cruzado maior/igual à TAS ou ausência de avanço são incompatíveis.
- Vento de stress adiciona um vetor contrário ao curso de cada trecho; temperatura altera apenas dependências já modeladas. Umidade relativa e nebulosidade são mantidas no contrafactual.
- Sensibilidade: diferenças centrais quando ambos os lados são admissíveis; unilaterais nos limites. Interação: `Δ combinado − soma(Δ individuais)`. É causalidade interna ao modelo.
- Quantis R7: interpolação entre as duas estatísticas de ordem vizinhas em `(n−1)q`. Percentis são independentes por métrica, não um voo único.
- Margem: combustível disponível menos perfil restante, contingência, reserva e componentes de alternado pertinentes. A continuação reutiliza o avaliador nativo de combustível restante com consumo 4D exato.
- Pareto: combustível, tempo, exposição integrada de risco meteorológico e margem; nenhuma soma nova de pesos arbitrários.

O vento vetorial é opt-in dos cenários. Os coeficientes aeronáuticos existentes não foram recalibrados ou inventados. A nova função pública de transição encapsula os integradores verticais existentes.

## Convergência e aproximações

Solucionador atmosfera/performance: até **8 iterações**, diferenças máximas de **2 s** em todos os nós/fases e **0,02 gal** de trip fuel. Falta de cobertura essencial ou não convergência não produz resultado confirmado. Referência UTC ausente não é inventada; deslocamento de partida exige previsão aplicável e validade dos avisos do OFP.

Transições do grafo/corredor: subpassos verticais até 1.000 ft, horizontais até 10 NM, mesma tolerância temporal/combustível. TOD é resolvido pela distância física da descida, com resíduo máximo de 0,02 NM. A busca usa até seis âncoras de waypoints reais, beam de oito estados, bins de 60 s e 0,5 gal e mudanças de FL até 2.000 ft por decisão. Discretização não garante ótimo global nem exclui alternativas perdidas pelo limite de busca.

Fronteiras: nove amostras por domínio e nove refinamentos por transição detectada, inclusive múltiplas transições e intervalos desconhecidos. A resolução da varredura é informada; ilhas mais estreitas podem não ser detectadas. WIND LIMIT é reavaliado mesmo quando outro slider muda.

## APIs e contrato validado

Documentação primária: [Ensemble API](https://open-meteo.com/en/docs/ensemble-api), [contrato OpenAPI](https://github.com/open-meteo/open-meteo/blob/main/openapi/ensemble.yml), [termos](https://open-meteo.com/en/terms) e [condições de uso](https://open-meteo.com/en/pricing).

O teste controlado de **24/10/2026** encontrou os campos isobáricos GEFS nulos/com unidade `undefined`. Esse resultado não é generalizado para todas as disponibilidades futuras do provedor. O adaptador seleciona explicitamente `ecmwf_ifs025_ensemble`, que retornou dados utilizáveis. A verificação completa recebeu **51 membros**, com **51 válidos e amostrados** a FL180 no ponto de controle. Isso comprova o contrato nesse ponto, não cobertura de qualquer voo. Evidência: [ensemble-live.json](ensemble-live.json).

ECMWF IFS escolhido: global, 0,25°, nativo de 3 horas, horizonte documentado de 15 dias e atualização de 6 horas; a API oferece interpolação horária. A implementação solicita temperatura °C, vento kn/°, altura geopotencial m, RH e nuvens %, nos níveis 1000/925/850/700/600/500/400/300 hPa. Identidades são extraídas das chaves reais; controle sem sufixo e `_memberNN` nunca são misturados entre posições. Unidades, comprimentos, timestamps, séries essenciais e cobertura 4D são validados. Alturas não vêm de uma atmosfera padrão.

Download em lotes de até quatro posições; no máximo 16 posições representativas da infraestrutura atual. Janela solicitada de 24 horas a partir do ETD. Membros incompletos ou sem cobertura essencial são excluídos com motivo; RH/nuvens ausentes mantêm ICE/RIDE e elegibilidade desconhecidos. Ausência de umidade não vira céu limpo. Membros que demonstram exaustão de combustível permanecem nas estatísticas adversas de demanda, mas não expõem estados impossíveis de combustível negativo.

A licença gratuita é para uso não comercial/CC BY 4.0, com limites documentados de 600 chamadas/minuto, 5.000/hora e menos de 10.000/dia; variáveis, posições e duração afetam o orçamento equivalente. Nenhuma chamada é feita por membro ou por pixel do slider. Sem nova consulta automática ao SimBrief. AWC continua nos snapshots publicados, sem chamada direta CORS no aplicativo.

## Cache e isolamento

Cache de cenário: até 64 entradas em memória; chave inclui plano completo/identidade/versão, inputs, FL/regime/potência, snapshot/modelo, ETD, perturbações, parâmetros e versão do solver. Ensemble: até três conjuntos por uma hora. Não são persistidas centenas de cenários.

Worker dedicado mantém a interface responsiva. Transporte preserva referências compartilhadas e sentinelas numéricas, sem duplicar previsões por JSON ou enviar funções. O DTO do ensemble dispensa a cópia das previsões brutas para a interface, mantendo resultados/cobertura/exposição. Debounce de 240 ms, AbortController, timeout e tokens de revisão descartam respostas antigas. Falha posterior da fonte não deixa uma distribuição anterior com estado AVAILABLE.

As versões dos assets/imports foram uniformizadas em `20261024-02` para impedir uma mistura futura de módulos novos e dependências em cache. Os testes antigos tiveram somente as versões esperadas atualizadas; nenhuma asserção funcional foi removida. Há teste adicional de coerência do grafo de imports.

## Testes e evidências

Resultados consolidados em [validation-summary.json](validation-summary.json) e [browser-audit.json](browser-audit.json).

- `npm ci`: concluído.
- `npm test`: **238 testes**, nenhum removido ou enfraquecido; inclui novos testes determinísticos dos cinco motores, transporte, limites físicos, UTC, cache e fontes ausentes.
- CSS: zero problemas na auditoria estática.
- Auditorias de navegador: Resilience Lab, aplicação, motor V2, Tracker e Mission Profile. Matriz 320/375/390/430/768/1024/1440/1920; PT/EN; LB/KG; GAL/L; A−/A/A+; foco, movimento rápido de sliders, preview, OFP ausente, 150 waypoints e API indisponível. **1.198 estados de navegador, zero falhas**; 291 estados específicos do Lab. Valores e evidências no resumo JSON.
- `validate:missions`: 11 cenários, incluindo seis sem recomendação, preservados sem forçar viabilidade.
- `verify:weather-live`: GFS, AWC upstream e snapshot publicado verificados; SimBrief não consultado, Pilot ID explicitamente removido do ambiente do comando.

As imagens são **capturas reais de Chromium com fixtures claramente ilustrativas**, sem alegação de voo real importado.

| Análise | Desktop 1440 px | Mobile 390 px |
|---|---|---|
| Stress | [captura](desktop-stress.png) | [captura](mobile-stress.png) |
| Ensemble | [captura](desktop-ensemble.png) | [captura](mobile-ensemble.png) |
| Corredor | [captura](desktop-corridor.png) | [captura](mobile-corridor.png) |
| Causal | [captura](desktop-causal.png) | [captura](mobile-causal.png) |
| Dinâmico | [captura](desktop-dynamic.png) | [captura](mobile-dynamic.png) |

[Tablet 768 px](tablet-dynamic.png). Recortes dos cards nos viewports indicados; a barra inferior foi omitida apenas no recorte documental. Contexto real da página, incluindo navegação e identificação global DEMO: [desktop](desktop-lab-context.png) / [celular](mobile-lab-context.png). Visão geral preservada: [desktop](desktop-app.png) / [celular](mobile-app.png).

## Arquivos e limites restantes

Arquivos funcionais alterados: `index.html`, `styles.css`, `js/app.js`, `layout.js`, `config.js`, `engine.js`, `simbrief.js`, `unified-optimization.js`, `mission-time.js`, `mission-profile-view.js`. `weather/open-meteo.js` aceita os níveis reais de cada modelo e contrafactuais. `package.json` adiciona `audit:resilience`. Outros módulos existentes só receberam versões coerentes de imports. Novos testes/fixture/script e todos os artefatos estão nas pastas correspondentes e em `review/resilience`.

Limitações explícitas: modelo estimado do simulador; sem telemetria; sem validação de pista, terreno, obstáculos, procedimento/ATC ou certificação; interpolação geográfica da infraestrutura atual; busca dinâmica limitada; triagem de O₂ conservadora pela maior altitude do perfil e exposição meteorológica conservadora. Desvios sem altitude/geometria/cobertura suficiente permanecem UNKNOWN. As reservas e o modelo legado do alternado de destino não foram substituídos por um modelo certificado. O download de um ensemble não comprova cobertura temporal/vertical/espacial da missão. Dados do teste real de API não constituem validação de um OFP real.

Perfis dinâmicos permanecem em análise; aplicar um caminho de vários FLs ao Tracker não está disponível nesta etapa.

A integração em produção continua dependendo de autorização explícita.
