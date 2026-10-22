/* Presentation only: the existing calculator keeps ownership of every result and input. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const content = $('#plannerContent');
  const nav = $('#areaNav');
  if (!content || !nav) return;

  const translations = {
    'pt-BR': {
      mission: 'Missão', planning: 'Planejamento', route: 'Rota & riscos', flight: 'Em voo',
      overview: 'Visão geral', score: 'Avaliação', config: 'Configuração',
      optimize: 'Otimização', systems: 'Peso & sistemas', analyses: 'Custo',
      ice: 'ICE', ride: 'RIDE', decisions: 'Decisões', update: 'Atualização', calibration: 'Calibração',
      completed: 'Voo concluído', history: 'Histórico', noPlan: 'Importe um OFP para começar.',
      missionTitle: 'Decisão operacional', planningTitle: 'Preparar e otimizar',
      routeTitle: 'Leitura operacional da rota', flightTitle: 'Acompanhar e calibrar',
      routeOverview: 'Resumo da rota', routeIce: 'Gelo', routeRide: 'Conforto',
      routeDecisions: 'ETP, alternado e desvio', missionAdjustment: 'Ajuste principal', openPlanning: 'Ajustar missão',
      openRoute: 'Analisar rota', loadOptimizer: 'LOAD Optimizer', flightTools: 'Ferramentas',
      reviewScore: 'Mission Score', riskAssessment: 'Riscos e restrições',
      planningShort: 'Planejar', routeShort: 'Rota',
      takeoffWeight: 'Peso de decolagem', oxygen: 'Oxigênio', fuelMargin: 'Margem de combustível',
      remainingLeg: 'Trecho restante', awaitingUpdate: 'Aguardando atualização manual', routeLegs: 'Trechos da rota',
    },
    'en-US': {
      mission: 'Mission', planning: 'Planning', route: 'Route & risks', flight: 'In flight',
      overview: 'Overview', score: 'Assessment', config: 'Configuration',
      optimize: 'Optimization', systems: 'Weight & systems', analyses: 'Cost',
      ice: 'ICE', ride: 'RIDE', decisions: 'Decisions', update: 'Update', calibration: 'Calibration',
      completed: 'Completed flight', history: 'History', noPlan: 'Import an OFP to begin.',
      missionTitle: 'Operational decision', planningTitle: 'Prepare and optimize',
      routeTitle: 'Operational route review', flightTitle: 'Monitor and calibrate',
      routeOverview: 'Route overview', routeIce: 'Icing', routeRide: 'Ride',
      routeDecisions: 'ETP, alternate and diversion', missionAdjustment: 'Main adjustment', openPlanning: 'Adjust mission',
      openRoute: 'Review route', loadOptimizer: 'LOAD Optimizer', flightTools: 'Tools',
      reviewScore: 'Mission Score', riskAssessment: 'Risks and constraints',
      planningShort: 'Plan', routeShort: 'Route',
      takeoffWeight: 'Takeoff weight', oxygen: 'Oxygen', fuelMargin: 'Fuel margin',
      remainingLeg: 'Remaining leg', awaitingUpdate: 'Awaiting manual update', routeLegs: 'Route legs',
    }
  };
  const areas = [
    ['mission', 'gauge', 'missionTitle', [['overview', 'overview'], ['score', 'score']]],
    ['planning', 'sliders-horizontal', 'planningTitle', [['config', 'config'], ['optimize', 'optimize'], ['systems', 'systems'], ['analyses', 'analyses']]],
    ['route', 'route', 'routeTitle', [['overview', 'overview'], ['ice', 'ice'], ['ride', 'ride'], ['decisions', 'decisions']]],
    ['flight', 'radio-tower', 'flightTitle', [['calibration', 'calibration']]],
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
      const label = target === mobileNav && ['planning', 'route'].includes(area) ? `${area}Short` : area;
      button.innerHTML = `${icon(glyph)}<span data-layout-text="${label}">${text(label)}</span>`;
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
  const overviewGrid = item(); overviewGrid.className = 'summary-grid'; overviewGrid.dataset.uiCardPair = ''; overviewGrid.dataset.uiOverlapGroup = ''; missionOverview.append(overviewGrid);
  const score = $('.mission-score-panel'); if (score) overviewGrid.append(score);
  const recommendation = item(); recommendation.className = 'panel recommendation-card';
  recommendation.innerHTML = `<div class="shared-card-head"><span data-layout-text="missionAdjustment">${text('missionAdjustment')}</span>${icon('wind')}</div><div class="recommendation-actions"><button type="button" class="primary-button" data-open-module="planning:config" data-layout-text="openPlanning">${text('openPlanning')}</button><button type="button" class="text-button" data-open-module="route:overview" data-layout-text="openRoute">${text('openRoute')}</button></div>`;
  const scoreAction = $('#missionScoreAction')?.closest('.mission-score-action');
  if (scoreAction) {
    scoreAction.querySelector('span')?.remove();
    recommendation.insertBefore(scoreAction, recommendation.querySelector('.recommendation-actions'));
  }
  overviewGrid.append(recommendation);
  const fuel = $('.fuel-panel'); if (fuel) missionOverview.append(fuel);
  move('.mission-strip', 'mission:score');
  const detailedScore = item(); detailedScore.className = 'panel score-detail-card';
  detailedScore.innerHTML = `<h2 data-layout-text="riskAssessment">${text('riskAssessment')}</h2>`;
  const reasons = $('#missionScoreReasons'); if (reasons) detailedScore.append(reasons);
  moduleNodes.get('mission:score').append(detailedScore);

  const controls = move('.controls-panel', 'planning:config');
  if (controls) {
    const config = moduleNodes.get('planning:config');
    const grid = item(); grid.className = 'planning-config-grid';
    config.append(grid); grid.append(controls);
    const aside = item(); aside.className = 'panel planning-live-summary';
    aside.innerHTML = `<div class="shared-card-head"><span data-layout-text="takeoffWeight">${text('takeoffWeight')}</span>${icon('scale')}</div><div class="planning-live-metrics"><div><span data-layout-text="oxygen">${text('oxygen')}</span><strong id="layoutOxygenSummary">—</strong></div><div><span data-layout-text="fuelMargin">${text('fuelMargin')}</span><strong id="layoutFuelMargin">—</strong></div></div>`;
    const weight = controls.querySelector('.weight-meter');
    if (weight) aside.insertBefore(weight, aside.querySelector('.planning-live-metrics'));
    grid.append(aside);
  }
  move('#optimizeMission', 'planning:optimize');
  move('#missionProposal', 'planning:optimize');

  const routeOverview = moduleNodes.get('route:overview');
  routeOverview.innerHTML = `<div class="route-rail-card"><div class="shared-card-head"><span data-layout-text="routeLegs">${text('routeLegs')}</span><strong id="layoutRouteMeta">—</strong></div><div class="route-rail" id="layoutRouteRail" aria-label="Trechos da rota"></div></div><div class="route-overview-grid">
    <button class="route-overview-card" type="button" data-open-module="route:ice">${icon('snowflake')}<span><strong data-layout-text="routeIce">${text('routeIce')}</strong><small id="layoutIceStatus">—</small></span>${icon('chevron-right')}</button>
    <button class="route-overview-card" type="button" data-open-module="route:ride">${icon('waves')}<span><strong data-layout-text="routeRide">${text('routeRide')}</strong><small id="layoutRideStatus">—</small></span>${icon('chevron-right')}</button>
    <button class="route-overview-card" type="button" data-open-module="route:decisions">${icon('route')}<span><strong data-layout-text="routeDecisions">${text('routeDecisions')}</strong><small id="layoutDecisionStatus">ETP · PNR · ALT · GLIDE · STEP</small></span>${icon('chevron-right')}</button>
  </div>`;

  const toolGroups = {
    'planning:systems': ['wb', 'oxygen'],
    'planning:analyses': ['cost'],
    'route:ice': ['ice'],
    'route:ride': ['ride'],
    'route:decisions': ['etp', 'alternate', 'glide', 'steps'],
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
  const updateStrip = $('#tool-card-update');
  const flightPanel = $('#manualFlightPanel');
  const confidence = $('#calibrationReference');
  if (updateStrip) moduleNodes.get('flight:calibration').append(updateStrip);
  if (flightPanel && updatePanel) moduleNodes.get('flight:calibration').append(flightPanel);
  if (confidence) $('.calibration-head')?.insertBefore(confidence, $('.calibration-value'));
  const oldModeTop = $('.manual-mode-top'); if (oldModeTop) oldModeTop.remove();

  const oldTools = $('.flight-tools-panel'); if (oldTools) oldTools.remove();
  const oldDashboard = $('.dashboard-grid'); if (oldDashboard) oldDashboard.remove();

  // Structural UI primitives are attached to both moved and generated nodes.
  // Module classes retain only their own layout and aviation-specific treatments.
  const componentKinds = [
    ['.panel', 'ui-card ui-card--summary'],
    ['.tool-view', 'ui-card ui-card--technical'],
    ['.kpi', 'ui-card ui-card--compact ui-metric'],
    ['.mission-strip > div, .planning-live-metrics > div, .cost-kpis > span, .wb-kpis > div', 'ui-metric'],
    ['.primary-button', 'ui-button ui-button--primary'],
    ['.text-button', 'ui-button ui-button--outline'],
    ['.status-pill, .feasibility-badge, .area-context, #iceModuleStatus, #rideModuleStatus', 'ui-status'],
  ];
  const adoptComponents = () => {
    for (const [selector, names] of componentKinds) {
      const classes = names.split(' ');
      document.querySelectorAll(selector).forEach(element => {
        if (classes.some(name => !element.classList.contains(name))) element.classList.add(...classes);
      });
    }
  };
  adoptComponents();

  // Presentation roles are assigned after the existing controls move into their areas.
  // The observer below also covers result rows generated after an OFP is imported.
  const visualRoles = {
    label: '.app-module label > span:first-child:not(.ui-unit-input), .range-control b, .planning-live-metrics span, .calibration-head > span, .shared-card-head > span, .kpi > span:first-of-type, .mission-strip span, .navigation-point > span, .advisor-card > span, .glide-kpis b, .wb-kpis b, .cost-kpis b, .cost-summary span, .cost-alternate-grid b, .cost-price-row > div > span, .ice-module-summary > div:first-child > span, .ride-module-summary > div:first-child > span, .ice-decision-grid span, .ride-decision-grid span',
    secondary: '#payloadOutput, #fuelOutput, #layoutFuelMargin, #layoutOxygenSummary, #powerSettingValue, .navigation-speeds strong, #calibrationMode, #calibrationFactors, #fuelRequiredSide, #costAlternateIncrement, .cost-alternate-grid strong, .cost-kpis strong, #costBreakdownTotal, #missionScoreAction',
    emphasis: '.advisor-card > strong, .glide-kpis strong, .wb-kpis strong, .cost-kpis strong, .ice-decision-grid strong, .ride-decision-grid strong',
    primary: '.kpi > strong, .planning-live-summary .weight-meter strong, .mission-strip strong, .ride-module-summary > div:first-child > strong, .ice-module-summary > div:first-child > strong, #etpDistance, #pnrDistance, #estimatedFlightCost, #financialEfficiency, #costOrigin',
  };
  const applyVisualRoles = () => {
    for (const [role, selector] of Object.entries(visualRoles)) {
      document.querySelectorAll(selector).forEach(element => {
        if (element.dataset.uiRole !== role) element.dataset.uiRole = role;
      });
    }
  };
  applyVisualRoles();

  const state = { area: 'mission', module: { mission: 'overview', planning: 'config', route: 'overview', flight: 'calibration' } };
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
    adoptComponents();
    applyVisualRoles();
    const pairs = [
      ['#cruiseIcingValue', '#layoutIceStatus'],
      ['#rideValue', '#layoutRideStatus'], ['#oxygenValue', '#layoutOxygenSummary'],
      ['#kpiFuelDelta', '#layoutFuelMargin'],
    ];
    for (const [source, target] of pairs) {
      const origin = $(source), display = $(target);
      if (origin && display && display.textContent !== origin.textContent) display.textContent = origin.textContent;
    }
    const context = $('[data-area-context="mission"]');
    const badge = $('#feasibilityBadge');
    if (context && badge) {
      const value = badge.hidden ? '' : badge.textContent;
      const tone = badge.classList.contains('viable') ? 'viable' : badge.classList.contains('marginal') ? 'marginal' : badge.classList.contains('unknown') ? 'unknown' : 'not-viable';
      const className = `area-context ui-status ${tone}`;
      if (context.textContent !== value) context.textContent = value;
      if (context.className !== className) context.className = className;
    }
  });
  observer.observe(content, { subtree: true, childList: true, characterData: true });
  function translateLayout() {
    document.querySelectorAll('[data-layout-text]').forEach(element => { element.textContent = text(element.dataset.layoutText); });
    noPlan.textContent = text('noPlan');
    const compact = matchMedia('(max-width: 760px)').matches;
    const labels = document.documentElement.lang === 'en-US'
      ? [['Recommended level', 'Level'], ['Required fuel', 'Fuel'], ['Estimated time', 'Time'], ['Maximum range', 'Range']]
      : [['Nível recomendado', 'Nível'], ['Combustível requerido', 'Combustível'], ['Tempo estimado', 'Tempo'], ['Alcance máximo', 'Alcance']];
    document.querySelectorAll('.kpi-grid .kpi > span:first-of-type').forEach((element, index) => {
      const pair = labels[index];
      if (!pair) return;
      element.textContent = compact ? pair[1] : pair[0];
      element.title = pair[0];
    });
    document.querySelectorAll('.module-nav').forEach(element => { element.setAttribute('aria-label', text(element.closest('[data-area-panel]').dataset.areaPanel)); });
    nav.setAttribute('aria-label', document.documentElement.lang === 'en-US' ? 'Main areas' : 'Áreas principais');
    mobileNav.setAttribute('aria-label', nav.getAttribute('aria-label'));
  }
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setTimeout(translateLayout, 0)));
  window.addEventListener('resize', translateLayout);
  window.VelocityLayout = { activate, translate: translateLayout, state };
  activate('mission', 'overview');
})();
