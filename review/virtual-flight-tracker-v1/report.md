# Virtual Flight Tracker 1.0 — revisão

**Base:** `main` em `031fe18fe00f4a4c1553f65e458f4e0e905f935d`.
**Branch:** `feature/virtual-flight-tracker-v1`.
**Estado:** proposta para Pull Request; sem merge e sem publicação no GitHub Pages.

## Arquitetura

- `js/virtual-flight.js` é o motor puro: trajetória cumulativa, relógio, estados, checkpoints, reconciliação, persistência e exposição restante. `js/app.js` controla apenas eventos, estado de sessão e apresentação.
- `js/engine.js` expõe amostras da subida e descida a partir dos mesmos cálculos que já forneciam os totais. Tempo, distância e consumo finais permanecem iguais. O cruzeiro reutiliza as seções existentes por trecho.
- O progresso usa a configuração aplicada: FL, modo/MAP/RPM, peso, combustível, oxigênio e K1/K2 aplicáveis. Uma rota curta com fases sobrepostas não recebe cruzeiro fictício.
- `js/simbrief.js` normaliza TOC/TOD a partir do navlog bruto. O evento OFP mantém origem SimBrief, ident, distância, tempo, altitude, coordenadas e qualidade quando disponíveis. Tempo textual ambíguo não é convertido. TOC/TOD do modelo permanecem separados e aparecem em detalhes na projeção restante.

## Relógio e checkpoints

O relógio só inicia com **Iniciar voo**. `NOT_STARTED`, `RUNNING`, `PAUSED` e `FINISHED` são estados explícitos; o término exige ação do piloto. O tempo simulado vem da ancoragem ao relógio real, com fatores 1×/2×/4×/8× aplicados somente dali em diante. Ao recuperar uma sessão `RUNNING`, a projeção é reconstruída e pede ressincronização; ela não presume que o Xbox continuou em voo.

**Sincronizar** exige apenas o fixo. FL, combustível e tempo são opcionais. O checkpoint guarda a posição e a origem confirmada pelo piloto. Um combustível observado substitui apenas a âncora futura; sem leitura, o motor estima o consumo entre posições sem inventar medição. Um FL diferente usa um novo perfil prospectivo somente quando a condição pode ser modelada. Se a atualização técnica informar FL sem perfil coerente, ela continua registrada, mas o Tracker pausa e exige nova sincronização. A calibração K1/K2 permanece no formulário técnico existente.

## Projeção restante e meteorologia

A seção contextual mostra distância, ETE, ETA quando em andamento, combustível no destino e alternado, reserva, margem e próximo fixo. O combustível de rota vem da integração do Tracker; a reserva e o alternado reutilizam `calculateRemainingFlightAssessment`. O Mission Score pré-voo não é reclassificado pelo Tracker.

ICE/RIDE são apresentados como **planejados**, não observados. O índice do trecho restante depende de confirmação explícita da correspondência de UTC pelo piloto e de evidência suficiente por amostra. Cobertura parcial, baixa confiança ou falta de alinhamento permanecem **NÃO AVALIADO**. Um bloqueio ocorrido somente em trecho já percorrido não é transferido automaticamente ao trecho restante.

## Persistência e limites

A sessão versionada fica no `localStorage`, ligada à identidade do OFP. Apenas ações gravam o estado; o contador visual não grava a cada segundo. Outro OFP não herda checkpoints nem configuração. O aplicativo não acessa SimConnect, GPS, telemetria, pausa, fator temporal ou instrumentos do Xbox. Os números sem checkpoint são estimativas para simulação. Não há garantia de execução contínua em segundo plano no iOS.

## Design System e verificação

Os tokens, a fonte, as quatro áreas e os componentes compartilhados continuam em `styles.css`. As regras novas ficam limitadas ao Tracker. Botões e campos reutilizam as classes existentes; números usam dígitos tabulares. O painel foi inspecionado em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px, além de PT-BR/EN-US, GAL/L, LB/KG e A−/A/A+.

- `npm ci`: concluído.
- `npm test`: 168 testes aprovados, incluindo 48 cenários do Tracker; CSS sem erros.
- `npm run validate:missions`: 11 cenários validados.
- `npm run audit:browser:v2`: 386 estados, 0 falhas, 92 capturas. [Resumo](system-audit-summary.json).
- `npm run audit:tracker`: 59 estados, 0 falhas, 38 capturas. [Auditoria focada](browser-audit.json).

As capturas abaixo são **reais do navegador, com um OFP sintético e valores ilustrativos**:

| Estado | Desktop | Tablet | Celular |
| --- | --- | --- | --- |
| Tracker | [captura](desktop-running.png) | [captura](tablet-running.png) | [captura](mobile-running.png) |
| Checkpoint | [captura](desktop-checkpoint-card.png) | [captura](tablet-checkpoint-card.png) | [captura](mobile-checkpoint-card.png) |
| Projeção | [captura](desktop-projection-card.png) | [captura](tablet-projection-card.png) | [captura](mobile-projection-card.png) |

Também há capturas de antes/depois de TOC e TOD em desktop e celular neste diretório.

## Arquivos da proposta

`README.md`, `index.html`, `styles.css`, `js/app.js`, `js/engine.js`, `js/simbrief.js`, `js/weather/exposure.js`, `js/virtual-flight.js`, `tests/virtual-flight.test.mjs`, `tests/visual-architecture.test.mjs`, `scripts/audit-browser.mjs`, `package.json` e as evidências deste diretório.

## Limitações restantes

- Não é possível conhecer a posição, combustível ou pausa real do Xbox sem ação do piloto.
- A correspondência do horário UTC do simulador ao OFP é declarada pelo piloto; o Tracker não a detecta.
- Quando a fase confirmada ou um FL observado não admite perfil coerente para todo o restante, o ETE/combustível restantes ficam indisponíveis em vez de serem extrapolados.
- A persistência é local ao navegador e não sincroniza entre dispositivos.
