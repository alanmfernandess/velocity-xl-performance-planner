# Foco — interface aprovada

Implementação visual de 2026-10-27, validada em `feature/foco-approved-interface-20261027`. A entrega inicial foi isolada da `main`; em 2026-10-27 o usuário autorizou expressamente a publicação. A publicação usa integração normal por pull request e GitHub Pages, preservando as tags abaixo.

## Base e restauração integral

A atualização dos remotos revelou duas versões diferentes. Ambas foram preservadas **antes de editar**:

| Ponto preservado | Commit | Tag publicada no GitHub |
| --- | --- | --- |
| Cópia local Quiet Cockpit, base funcional das prévias | `05eb35ed53ae2ca977b676168d5967cc67668cdf` | `backup/pre-foco-local-20261027` |
| `origin/main`, restaurada anteriormente | `834227b9378fdccc727bea318e814380a8acff9d` | `backup/pre-foco-main-20261027` |

A branch Foco parte da cópia **local**. A publicação autorizada integra explicitamente essa base do Quiet Cockpit e a interface Foco à `main`, que estava em `834227b`. A diferença de bases foi registrada antes da implementação; ambas continuam integralmente disponíveis nas tags de restauração.

Cópias adicionais fora do repositório, na pasta `work/backups` desta tarefa:

- `pre-foco-20261027.bundle`: histórico e referências completos, verificado com `git bundle verify`.
- `pre-foco-working-tree-20261027.tar.gz`: arquivos rastreados e não rastreados do diretório anterior. Exclui somente `.git` (preservado no bundle) e dependências reproduzíveis de `node_modules`.
- `pre-foco-checksums.json`: SHA-256 dos dois arquivos.

Para inspecionar ou preparar uma restauração sem apagar a branch nova, criar outra branch a partir da tag correspondente. Por exemplo: `git switch -c restore/pre-foco backup/pre-foco-main-20261027`. Publicar uma restauração seria uma ação separada.

Os nomes de armazenamento e os registros de usuário existentes foram mantidos. A preservação do código não constitui exportação do armazenamento privado de cada navegador; os dados continuam na mesma origem/navegador e não são apagados pela interface.

## Referência visual e arquitetura

Referência congelada: `review/foco/approved-reference.html`. Comparação real lado a lado: `review/foco/comparison.html` e `comparison.png`. Os valores do mockup são ilustrativos; não foram copiados para os resultados do aplicativo.

- `styles.css` continua sendo a única folha: tokens, base, componentes, módulos e grupos responsivos. As definições existentes foram substituídas; não foi adicionada uma folha concorrente de correções.
- Inter/system, pesos 400/500; legenda 12 px, interface 14 px, controles e títulos 16 px, valores principais 32 px. O controle A−/A/A+ continua escalando a interface.
- Controles com mínimo de 48 px, raio de 12 px, intervalo principal de 24 px e recuo interno de 16 px. Na tela mais estreita as margens laterais passam para 16 px.
- Paleta monocromática. Estados continuam identificados por texto/ícones; cores não substituem a classificação.
- Números e títulos dos indicadores compartilham linhas da grade. Selecionar um nível muda apenas o fundo, mantendo geometria e posição das colunas.
- Confirmações de sucesso como “Guardado.” foram removidas globalmente; erros e validações continuam disponíveis.
- Navegação inferior respeita safe areas. Pinça/zoom de acessibilidade permanece disponível. A implementação usa o viewport do dispositivo; a moldura arredondada e o fundo pontilhado da referência pertencem somente à prévia.

## Localização das funções

| Área | Acesso |
| --- | --- |
| Plano | Nível/Score, ETE/Trip/Margem, Aplicar, Comparar, Ajustar; atalhos W&B, O₂, Fuel, Custo |
| Ajustes | ECON/NORMAL/FAST/MANUAL, potência e dados técnicos; acessos a combustível, sistemas e Resilience |
| Comparar | Lista compacta de níveis; seleção abre a análise completa, modo, potência manual, comparação e aplicação explícita |
| Combustível | A bordo, reserva, requerido e ação; distribuição completa em Detalhes |
| W&B | Todas as estações e combustível; corredor de CG e limites reais do modelo; tabela e demais resultados em Detalhes |
| Custo | Estimativa, moeda, preço manual por litro e alternado; eficiência, custos por fase/pessoa/hora/NM e projeção em Detalhes |
| Rota | Linha do tempo CLB/CRZ/DSC derivada do perfil resolvido, camadas METEO/ICE/RIDE/FUEL; waypoints e dados de posição em OFP; Trechos e Decisões com módulos completos |
| ICE/RIDE | Avaliações, fases, cobertura, evidências, alternado e preferências anteriores preservados |
| Decisões | ETP/PNR, alternado/desvio, GLIDE e Step Climb |
| Em voo | Posição, ETE e Fuel; iniciar/pausar no cabeçalho; Checkpoint, Calibração e Histórico |
| Calibração | TAS e Fuel Flow dentro das caixas, unidades permanentes, Registrar; trava por par completo e contexto de cruzeiro mantida; referência e reset em Detalhes |
| Histórico | Checkpoints existentes e controles avançados do Tracker (fator, conclusão e ajuste do tempo) |
| Preferências | Peso, combustível, texto, idioma e informações/documentação; mesma persistência anterior |
| OFP | Marca VX / XL abre o formulário original. Sem OFP ele aparece automaticamente; nenhum voo demonstrativo é apresentado como real |

EUR foi acrescentado a BRL e USD. Preços continuam manuais e independentes por origem/moeda; não há conversão cambial automática. O custo é calculado com o preço digitado na moeda escolhida.

## Preservação matemática

Nenhuma fórmula, coeficiente de performance, otimizador, regra de Score, cálculo de gelo/conforto, W&B, oxigênio, trajetória ou calibração foi alterado.

`review/foco/domain-preservation.json` documenta comparação dos **25 arquivos de domínio** com o ponto local preservado: arquivos idênticos depois de normalizar os parâmetros de cache. Os imports usam uma versão de cache única para evitar módulos incompatíveis na atualização. As alterações de `app.js` são apresentação, supressão de confirmações, EUR, navegação após importação e adaptação do campo de combustível às unidades escolhidas.

A linha do tempo representa as durações e o TOC/TOD já calculados; não introduz nova estimativa de performance. Continuam disponíveis restrições e estados UNKNOWN. Não há classificação VIÁVEL forçada.

## Verificação executada

- `npm test`: **240 testes aprovados**. Inclui comparação dos 27 candidatos com a referência matemática anterior, tolerância `1e-9`.
- `npm run validate:missions`: **11 cenários**, seis corretamente sem recomendação.
- `npm run audit:browser`: Chromium real, **496 estados**, zero erros reportados. Larguras 320/375/390/430/768/1024/1440/1920; PT/EN, LB/KG, GAL/L e A−/A/A+.
- Verificações: controles de toque, limites do viewport, SVG, paleta, importação, aplicação explícita, posição fracionária, validação da dupla TAS/FF, persistência da calibração e de EUR/preço após reabrir; seleções com geometria estável; indicadores centrados; campos e Registrar alinhados com intervalos de 24 px; cinco modos Resilience; meteorologia ausente bloqueando aplicação.
- CSS: **936 regras / 2814 declarações, zero problemas** no auditor estático.
- Capturas reais desktop (1440), tablet (768), celular (390), tela principal e módulos internos em `review/foco`.
- Antes/depois renderizados novamente a partir da tag local preservada, nos três tamanhos; referência e aplicativo inspecionados lado a lado.

A meteorologia e o OFP dos testes visuais são **fixtures ilustrativas interceptadas apenas no navegador de testes**. Não demonstram um voo real nem uma validação física dos coeficientes estimados. Nenhuma fixture é carregada pelo aplicativo de produção.

Não houve teste em iPhone/iPad/Android físico. Safe areas, teclado por visual viewport e acessibilidade são verificados em navegador; a instalação nativa como PWA ainda depende de avaliação em dispositivo.

## Correção móvel — navegação e conteúdo curto

O espaço amplo entre os últimos controles e a navegação não era uma margem do card: resultava do posicionamento `fixed` no fim de um viewport mais alto que o conteúdo. A correção móvel usa fluxo com `position: sticky; bottom: ...`: em uma página curta o menu fica imediatamente após a composição; em páginas extensas ele permanece acessível na base visível durante a rolagem. Não há alongamento de fontes, campos ou cards para ocupar altura artificialmente.

A regra aplica-se até 760 px e também a dispositivos com toque como entrada principal, cobrindo celulares na horizontal. O espaço inferior reservado à barra fixa foi removido; as safe areas e o deslocamento por teclado foram mantidos, e o scroll padding protege os controles durante a rolagem. Desktop com mouse mantém a composição anterior.

Verificação adicional: 664 estados de Chromium, com todas as telas em 320×568, 375×667, 390×844, 414×896, **428×926 (iPhone 14 Plus)**, 430×932, 480×960 e viewport reduzido 390×400. Foram medidos o vão entre conteúdo e navegação, a visibilidade no início/fim das páginas e a ausência de overflow. Um contexto de toque também verifica a seleção da regra em orientação horizontal. Esses resultados são emulação de navegador, não execução em um aparelho físico.

Ponto de restauração adicional: `backup/pre-mobile-nav-flow-20261027`, que conserva a publicação Foco `71c7d68` antes desta correção.

O ensaio adicional `npm run audit:mobile:engines` executou **56 estados em WebKit 26.0 e Chromium**, sem erros, em retrato/paisagem e nas alturas reduzidas. Evidências em `review/foco/mobile-navigation/`. O WebKit é usado como verificação de motor, sem alegar teste físico em Safari/iPhone. O auditor CSS registra 939 regras e 2820 declarações, sem problemas.
