/* Presentation only: the existing calculator keeps ownership of every result and input. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const content = $('#plannerContent');
  const nav = $('#areaNav');
  if (!content || !nav) return;

  const translations = {
    'pt-BR': {
      mission: 'Missão', planning: 'Planejamento', route: 'Rota & riscos', flight: 'Em voo',
      overview: 'Visão geral', score: 'Avaliação', config: 'Configuração', levels: 'Performance & níveis',
      optimize: 'Otimização', systems: 'Peso & sistemas', analyses: 'Análises', matrix: 'Matriz & MORA',
      ice: 'ICE', ride: 'RIDE', decisions: 'Decisões', update: 'Atualização', calibration: 'Calibração',
      completed: 'Voo concluído', history: 'Histórico', noPlan: 'Importe um OFP para começar.',
      missionTitle: 'Decisão operacional', planningTitle: 'Preparar e otimizar',
      routeTitle: 'Leitura operacional da rota', flightTitle: 'Acompanhar e calibrar',
      routeOverview: 'Resumo da rota', routeTerrain: 'Terreno', routeIce: 'Gelo', routeRide: 'Conforto',
      routeDecisions: 'ETP, alternado e desvio', missionAdjustment: 'Ajuste principal', openPlanning: 'Ajustar missão',
      openRoute: 'Analisar rota', loadOptimizer: 'LOAD Optimizer', flightTools: 'Ferramentas',
      reviewScore: 'Mission Score', riskAssessment: 'Riscos e restrições', 
    },
    'en-US': {
      mission: 'Mission', planning: 'Planning', route: 'Route & risks', flight: 'In flight',
      overview: 'Overview', score: 'Assessment', config: 'Configuration', levels: 'Performance & levels',
      optimize: 'Optimization', systems: 'Weight & systems', analyses: 'Analysis', matrix: 'Matrix & MORA',
      ice: 'ICE', ride: 'RIDE', decisions: 'Decisions', update: 'Update', calibration: 'Calibration',
      completed: 'Completed flight', history: 'History', noPlan: 'Import an OFP to begin.',
      missionTitle: 'Operational decision', planningTitle: 'Prepare and optimize',
      routeTitle: 'Operational route review', flightTitle: 'Monitor and calibrate',
      routeOverview: 'Route overview', routeTerrain: 'Terrain', routeIce: 'Icing', routeRide: 'Ride',
      routeDecisions: 'ETP, alternate and diversion', missionAdjustment: 'Main adjustment', openPlanning: 'Adjust mission',
      openRoute: 'Review route', loadOptimizer: 'LOAD Optimizer', flightTools: 'Tools',
      reviewScore: 'Mission Score', riskAssessment: 'Risks and constraints',
    }
  };
  const areas = [
    ['mission', 'gauge', 'missionTitle', [['overview', 'overview'], ['score', 'score']]],
    ['planning', 'sliders-horizontal', 'planningTitle', [['config', 'config'], ['levels', 'levels'], ['optimize', 'optimize'], ['systems', 'systems'], ['analyses', 'analyses']]],
    ['route', 'route', 'routeTitle', [['overview', 'overview'], ['matrix', 'matrix'], ['ice', 'ice'], ['ride', 'ride'], ['decisions', 'decisions']]],
    ['flight', 'radio-tower', 'flightTitle', [['update', 'update'], ['calibration', 'calibration'], ['completed', 'completed'], ['history', 'history']]],
  ];
  const areaNodes = new Map();
  const moduleNodes = new Map();
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const text = (key) => (translations[document.documentElement.lang === 'en-US' ? 'en-US' : 'pt-BR'][key] || key);
  const item = (key) => document.createElement('div');

  const noPlan = document.createElement('div');
  noPlan.className = 'no-plan-state';
  noPlan.textContent = text('noPlan');
  content.before(noPlan);

  const mobileNav = document.createElement('nav');
  mobileNav.className = 'mobile-area-nav';
  mobileNav.setAttribute('aria-label', 'Áreas principais');
  document.body.append(mobileNav);

  for (const [area, glyph, titleKey, modules] of areas) {
    for (const target of [nav, mobileNav]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.areaButton = area;
      button.innerHTML = `${icon(glyph)}<span data-layout-text="${area}">${text(area)}</span>`;
      target.append(button);
    }
    const section = document.createElement('section');
    section.className = 'app-area';
    section.dataset.areaPanel = area;
    const heading = document.createElement('div');
    heading.className = 'area-heading';
    heading.innerHTML = `<div><span data-layout-text="${area}">${text(area)}</span><h1 data-layout-text="${titleKey}">${text(titleKey)}</h1></div><span class="area-context" data-area-context="${area}"></span>`;
    section.append(heading);
    const tabs = document.createElement('nav');
    tabs.className = 'module-nav';
    tabs.setAttribute('aria-label', text(area));
    for (const [module, label] of modules) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.moduleButton = `${area}:${module}`;
      button.dataset.layoutText = label;
      button.textContent = text(label);
      tabs.append(button);
    }
    section.append(tabs);
    for (const [module] of modules) {
      const panel = document.createElement('div');
      panel.className = 'app-module';
      panel.dataset.modulePanel = `${area}:${module}`;
      section.append(panel);
      moduleNodes.set(`${area}:${module}`, panel);
    }
    content.append(section);
    areaNodes.set(area, section);
  }

  function move(selector, destination) {
    const node = $(selector);
    if (node) moduleNodes.get(destination).append(node);
    return node;
  }
  const missionOverview = moduleNodes.get('mission:overview');
  move('.kpi-grid', 'mission:overview');
  const overviewGrid = item(); overviewGrid.className = 'summary-grid'; missionOverview.append(overviewGrid);
  const score = $('.mission-score-panel'); if (score) overviewGrid.append(score);
  const recommendation = item(); recommendation.className = 'panel recommendation-card';
  recommendation.innerHTML = `<div class="shared-card-head"><span data-layout-text="missionAdjustment">${text('missionAdjustment')}</span>${icon('wind')}</div><div class="recommendation-actions"><button type="button" class="primary-button" data-open-module="planning:config" data-layout-text="openPlanning">${text('openPlanning')}</button><button type="button" class="text-button" data-open-module="route:overview" data-layout-text="openRoute">${text('openRoute')}</button></div>`;
  const scoreAction = $('#missionScoreAction')?.closest('.mission-score-action');
  if (scoreAction) recommendation.insertBefore(scoreAction, recommendation.querySelector('.recommendation-actions'));
  overviewGrid.append(recommendation);
  const fuel = $('.fuel-panel'); if (fuel) missionOverview.append(fuel);
  move('.mission-strip', 'mission:score');
  const detailedScore = item(); detailedScore.className = 'panel score-detail-card';
  detailedScore.innerHTML = `<h2 data-layout-text="riskAssessment">${text('riskAssessment')}</h2>`;
  const reasons = $('#missionScoreReasons'); if (reasons) detailedScore.append(reasons);
  moduleNodes.get('mission:score').append(detailedScore);

  move('.controls-panel', 'planning:config');
  move('.visual-panel', 'planning:levels');
  move('.levels-section', 'planning:levels');
  const optimizeButton = document.createElement('button');
  optimizeButton.type = 'button'; optimizeButton.className = 'primary-button';
  optimizeButton.dataset.forwardClick = 'optimizeMission'; optimizeButton.dataset.layoutText = 'optimize'; optimizeButton.textContent = text('optimize');
  moduleNodes.get('planning:optimize').append(optimizeButton);

  move('.terrain-panel', 'route:matrix');
  const routeOverview = moduleNodes.get('route:overview');
  routeOverview.innerHTML = `<div class="route-overview-grid">
    <button class="route-overview-card" type="button" data-open-module="route:matrix">${icon('mountain')}<span><strong data-layout-text="routeTerrain">${text('routeTerrain')}</strong><small id="layoutTerrainStatus">—</small></span>${icon('chevron-right')}</button>
    <button class="route-overview-card" type="button" data-open-module="route:ice">${icon('snowflake')}<span><strong data-layout-text="routeIce">${text('routeIce')}</strong><small id="layoutIceStatus">—</small></span>${icon('chevron-right')}</button>
    <button class="route-overview-card" type="button" data-open-module="route:ride">${icon('waves')}<span><strong data-layout-text="routeRide">${text('routeRide')}</strong><small id="layoutRideStatus">—</small></span>${icon('chevron-right')}</button>
    <button class="route-overview-card" type="button" data-open-module="route:decisions">${icon('route')}<span><strong data-layout-text="routeDecisions">${text('routeDecisions')}</strong><small id="layoutDecisionStatus">ETP · PNR · ALT · GLIDE · STEP</small></span>${icon('chevron-right')}</button>
  </div>`;

  const toolGroups = {
    'planning:optimize': ['load'],
    'planning:systems': ['wb', 'oxygen'],
    'planning:analyses': ['compare', 'cost', 'confidence'],
    'route:ice': ['ice'],
    'route:ride': ['ride'],
    'route:decisions': ['etp', 'alternate', 'glide', 'steps'],
    'flight:update': ['update'],
  };
  for (const [destination, keys] of Object.entries(toolGroups)) {
    const module = moduleNodes.get(destination);
    const choices = item(); choices.className = 'tool-choice';
    const host = item(); host.className = 'tool-host';
    module.append(choices, host);
    for (const key of keys) {
      const button = key === 'update' ? $('#tool-card-update') : $(`[data-tool-view="${key}"]`);
      const panel = $(`[data-tool-panel="${key}"]`);
      if (button) choices.append(button);
      if (panel) host.append(panel);
    }
    if (keys.length === 1) choices.classList.add('single-choice');
  }

  const updatePanel = $('[data-tool-panel="update"]');
  const flightPanel = $('#manualFlightPanel');
  const finishedPanel = $('#manualFinishedPanel');
  const calibration = $('#calibrationForm');
  const history = $('.debrief-history-wrap');
  if (flightPanel && updatePanel) moduleNodes.get('flight:update').append(flightPanel);
  if (calibration) moduleNodes.get('flight:calibration').append(calibration);
  if (finishedPanel) { finishedPanel.hidden = false; moduleNodes.get('flight:completed').append(finishedPanel); }
  if (history) { history.open = true; moduleNodes.get('flight:history').append(history); }
  const modeTabs = $('.manual-mode-tabs'); if (modeTabs) modeTabs.hidden = true;
  if (flightPanel) flightPanel.hidden = false;
  if (updatePanel) updatePanel.hidden = true;

  const oldTools = $('.flight-tools-panel'); if (oldTools) oldTools.remove();
  const oldDashboard = $('.dashboard-grid'); if (oldDashboard) oldDashboard.remove();

  const state = { area: 'mission', module: { mission: 'overview', planning: 'config', route: 'overview', flight: 'update' } };
  function activate(area, module = state.module[area]) {
    if (!areaNodes.has(area)) return;
    state.area = area;
    state.module[area] = module;
    for (const [key, node] of areaNodes) node.hidden = key !== area;
    document.querySelectorAll('[data-area-button]').forEach(button => {
      const active = button.dataset.areaButton === area;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-module-button]').forEach(button => {
      const active = button.dataset.moduleButton === `${area}:${module}`;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    for (const [key, node] of moduleNodes) node.hidden = key !== `${area}:${module}`;
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }
  document.addEventListener('click', event => {
    const areaButton = event.target.closest('[data-area-button]');
    if (areaButton) { activate(areaButton.dataset.areaButton); return; }
    const moduleButton = event.target.closest('[data-module-button]');
    if (moduleButton) { const [area, module] = moduleButton.dataset.moduleButton.split(':'); activate(area, module); return; }
    const link = event.target.closest('[data-open-module]');
    if (link) { const [area, module] = link.dataset.openModule.split(':'); activate(area, module); return; }
    const forward = event.target.closest('[data-forward-click]');
    if (forward) document.getElementById(forward.dataset.forwardClick)?.click();
  });
  const observer = new MutationObserver(() => {
    const pairs = [
      ['#terrainStatus', '#layoutTerrainStatus'], ['#cruiseIcingValue', '#layoutIceStatus'],
      ['#rideValue', '#layoutRideStatus'],
    ];
    for (const [source, target] of pairs) {
      const origin = $(source), display = $(target);
      if (origin && display && display.textContent !== origin.textContent) display.textContent = origin.textContent;
    }
    const context = $('[data-area-context="mission"]');
    const badge = $('#feasibilityBadge');
    if (context && badge) { context.textContent = badge.hidden ? '' : badge.textContent; context.className = `area-context ${badge.className.includes('viable') ? 'viable' : badge.className.includes('marginal') ? 'marginal' : 'not-viable'}`; }
  });
  observer.observe(content, { subtree: true, childList: true, characterData: true });
  function translateLayout() {
    document.querySelectorAll('[data-layout-text]').forEach(element => { element.textContent = text(element.dataset.layoutText); });
    noPlan.textContent = text('noPlan');
  }
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setTimeout(translateLayout, 0)));
  window.VelocityLayout = { activate, translate: translateLayout, state };
  activate('mission', 'overview');
})();
