# Resilience Engine — auditoria prévia

Base: main d7976b1; branch local feature/mission-intelligence-resilience. Nenhum push, merge ou deploy autorizado.

## Arquitetura encontrada
- OFP normalizado por simbrief.js, identidade request_id e horários UTC; navlog integral separado dos pontos utilizáveis. Persistência original permanece intacta.
- unified-optimization.js avalia as 27 combinações com um snapshot compartilhado, solver combustível/peso independente, elegibilidade antes do ranking; recomendação, análise e configuração aplicada são estados separados.
- engine.js contém performance, integração vertical em seções, cruzeiro por trecho, W&B, O2, alternado, ETP/PNR e GLIDE. K1/K2 e checkpoints pertencem à calibração/Tracker e não serão regravados.
- mission-profile.js adapta os resultados detalhados para consultas distância/tempo/combustível; mission-time.js já resolve o acoplamento temporal. trajetória meteorológica conserva UTC e proveniência. Snapshot GFS e snapshots AWC não são telemetria.
- planWithForecast ainda usa ETA proporcional do OFP como semente. Será substituída por tempos obtidos de um perfil físico de referência; as novas análises resolvem novamente seu próprio perfil até convergir.
- styles.css é a única folha; layout.js distribui os módulos nas quatro áreas. Componentes, escala e tokens de review/design-system.md são obrigatórios.

## Integração proposta
Um núcleo comum de cenários 4D reutiliza o avaliador existente com combustível fixo explícito, sem mudar o solver padrão de combustível recomendado. Perturbações são cópias isoladas. Stress e diferenças finitas, membros reais de ensemble, corredor e busca sequencial consomem esse núcleo e as funções físicas existentes. Resultados exploratórios não escrevem configuração, ranking, score ou Tracker.

Transições verticais reutilizam climbProfile/descentProfile via interface pública; vento vetorial é opt-in dos cenários. Busca dinâmica limitada e Pareto não implica ótimo global. Fontes incompletas e transições sem cobertura permanecem UNKNOWN.

Ensemble: documentação oficial consultada em 24/10/2026. Teste pequeno real do ncep_gefs025 retornou todos os campos isobáricos nulos/unidades undefined; não utilizável para aviação nesse contrato. ECMWF IFS 0.25° ensemble retornou temperatura °C, altura geopotencial m e vento kn/° em 850 hPa. Adaptador deve validar cada campo/membro e escolher explicitamente esse modelo, sem substituir GEFS por dados sintéticos. Download somente sob solicitação; cache limitado em memória, abort e descarte de respostas antigas.

Fontes: https://open-meteo.com/en/docs/ensemble-api ; https://github.com/open-meteo/open-meteo/blob/main/openapi/ensemble.yml ; https://open-meteo.com/en/terms ; https://open-meteo.com/en/pricing
