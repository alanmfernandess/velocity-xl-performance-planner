# Pilot Decision Engine 3.0 — relatório de implementação

Branch: `feature/pilot-decision-engine-v3` (base: `main` em `c2c557d8ff0d967750882bcc7eae5626a19df1c0`). Sem merge na `main`.

## Motor e decisão

O Unified Mission Engine usa o mesmo caminho de avaliação para as 27 combinações automáticas (FL100, FL120, FL140, FL160, FL180, FL200, FL220, FL240 e FL250 × ECON, NORMAL e FAST). Reaproveita um único snapshot meteorológico validado e calcula novamente performance, combustível, trajetória, ICE/RIDE, W&B, oxigênio, alternado, ETP/PNR, GLIDE, custo e Mission Score para cada combinação. O modo manual MAP/RPM é um 28º cenário somente quando solicitado, calculado pelo mesmo avaliador, sem alterar a matriz original.

A renderização reutiliza o resultado de 27 combinações quando os parâmetros e o snapshot meteorológico não mudaram; interações de idioma, unidades e navegação não repetem o cálculo. O botão de otimização produz um novo snapshot deliberado.

A elegibilidade separa `ELIGIBLE`, `MARGINAL`, `UNKNOWN` e `INCOMPATIBLE` antes da ordenação. Bloqueios físicos impedem promoção pelo score. Dados meteorológicos insuficientes não geram recomendação confirmada. O ranking prioriza candidatos elegíveis, depois marginais avaliados, score, preferências e desempate determinístico. Os troféus aparecem somente para até três FL distintos e viáveis; marginais aparecem em área separada. A ausência de solução mostra diagnóstico, sem FL recomendado inventado.

A interface mantém três estados independentes: recomendação automática, alternativa em análise e configuração aplicada. A troca entre presets e MAP/RPM atualiza a comparação sem aplicar a escolha. A aplicação explícita persiste somente para o OFP correspondente; um cenário marginal exige uma segunda confirmação. Mudanças nos parâmetros ou na meteorologia tornam a comparação anterior desatualizada.

## Navegação e calibração

O botão **Otimizar missão** fica abaixo do peso de decolagem em **Planejamento → Configuração**. A antiga aba de otimização foi removida. A potência manual foi concentrada no painel contextual da decisão, evitando um ajuste de Planejamento que não participava da matriz automática. **Em voo** abre diretamente um formulário com posição, FL, combustível, TAS e Fuel Flow. O mesmo botão atualiza o voo ou atualiza e calibra; TAS e Fuel Flow devem vir juntos. A validação ocorre antes da gravação. K1/K2 legados sem referência permanecem armazenados e pendentes, sem aplicação a outro regime. A redefinição fica em detalhes técnicos e exige confirmação.

Foram removidos a proposta antiga, a duplicação de atualização/calibração, abas sem alternativa, regras CSS obsoletas e textos que repetiam um estado já visível. Alertas de ICE, RIDE, combustível, W&B, oxigênio, alternado, cobertura meteorológica e terreno continuam acessíveis.

## Verificação

- `npm ci`: concluído.
- `npm test`: 118 testes aprovados, incluindo novos testes para a matriz, ranking, seleção manual, segurança, meteorologia e calibração.
- `npm run lint:css`: zero problemas.
- `npm run validate:missions`: 11 cenários sintéticos validados; seis sem recomendação confirmada.
- `npm run audit:browser:v2`: 327 estados em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px, com PT-BR/EN-US, LB/KG, GAL/L e A−/A/A+; zero falhas na rodada final.

O arquivo `decision-engine-v3-browser-audit.json` contém as medidas e verificações. As capturas em `decision-engine-v3/` são de um OFP e respostas meteorológicas **sintéticos**, identificados por `VISUAL-FIXTURE`; servem à validação da interface, não à comprovação de um voo real. Há capturas de Planejamento, Top 3, comparação, Em voo, ICE/RIDE e cenários sem solução, em desktop, tablet e celular.

## Limites

O cálculo continua estimado e não certificado. A confiabilidade da recomendação depende da cobertura efetiva do OFP, GFS e AWC. Terreno e obstáculos não são integralmente avaliados. A branch está pronta para revisão visual; a versão pública da `main` permanece inalterada até aprovação e merge.
