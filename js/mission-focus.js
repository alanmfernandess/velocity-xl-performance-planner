/* Monochrome Pro: presentation only. All evaluations and actions remain in app.js. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const area = $('[data-area-panel="mission"]');
  const overview = $('[data-module-panel="mission:overview"]');
  const assessment = $('[data-module-panel="mission:score"]');
  const panel = $('#pilotDecisionPanel');
  if (!area || !overview || !assessment || !panel) return;
  document.body.classList.add('focus-ui-ready');
  const view = document.createElement('div');
  view.className = 'focus-layout';
  view.innerHTML = '<div class="focus-main">' +
    '<section class="focus-card focus-hero" aria-label="Resumo da missão">' +
    '<div class="focus-hero-top"><span id="focus-recommend-label">NÍVEL</span><span id="focus-auto-label"></span></div>' +
    '<strong class="focus-level" id="focus-level">—</strong>' +
    '<div class="focus-profile" id="focus-profile">—</div>' +
    '<div class="focus-explanation" id="focus-explanation" hidden></div>' +
    '<div class="focus-metrics">' +
    '<div><span>FUEL</span><strong id="focus-fuel">—</strong></div>' +
    '<div><span>TEMPO</span><strong id="focus-time">—</strong></div>' +
    '<div><span>SCORE</span><strong id="focus-score">—</strong></div>' +
    '</div>' +
    '<div class="focus-actions"><button class="focus-primary" id="focus-compare" type="button">Comparar níveis <span aria-hidden="true">↗</span></button>' +
    '<button class="focus-secondary" type="button" data-open-module="mission:score">Detalhes</button></div></section>' +
    '<section class="focus-card focus-checks"><div class="focus-checks-title"><strong>Checks</strong><button type="button" data-open-module="mission:score">Ver tudo ↗</button></div>' +
    '<div class="focus-check-grid"><button type="button" data-open-module="mission:score"><small>ICE</small><b id="focus-ice">—</b></button>' +
    '<button type="button" data-open-module="mission:score"><small>RIDE</small><b id="focus-ride">—</b></button>' +
    '<button type="button" data-open-module="mission:score"><small>O₂</small><b id="focus-oxygen">—</b></button></div></section></div>' +
    '<aside class="focus-aside"><section class="focus-card focus-pilot"><span class="focus-eyebrow">PILOTO</span>' +
    '<span class="focus-smalllabel">Aplicado</span><strong id="focus-applied">—</strong>' +
    '<div class="focus-divider"></div><span class="focus-smalllabel">Alternativas</span><strong id="focus-alternatives">—</strong>' +
    '<button id="focus-open-comparison" type="button">Abrir comparação ↗</button></section>' +
    '<p class="focus-terrain">Terreno e obstáculos: <strong>não avaliados</strong>.</p></aside>';
  overview.prepend(view);
  const scoreLayout = overview.querySelector('.summary-grid');
  if (scoreLayout) assessment.prepend(scoreLayout);
  const fuel = overview.querySelector('.fuel-panel');
  if (fuel) {
    const details = document.createElement('details');
    details.className = 'focus-technical';
    const summary = document.createElement('summary');
    summary.textContent = 'Combustível · detalhes';
    details.append(summary, fuel);
    assessment.append(details);
  }
  const overlay = document.createElement('section');
  overlay.id = 'focus-overlay';
  overlay.className = 'focus-overlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Comparar configurações');
  overlay.innerHTML = '<button type="button" class="focus-backdrop" data-focus-close aria-label="Fechar comparação"></button>' +
    '<div class="focus-drawer" role="dialog" aria-modal="true" aria-label="Comparar níveis">' +
    '<div class="focus-drawer-header"><div><small>MISSÃO</small><strong>Comparar níveis</strong></div>' +
    '<button type="button" id="focus-close" data-focus-close aria-label="Fechar comparação">×</button></div>' +
    '<div id="focus-empty" class="focus-empty" hidden><p>Otimize a missão para comparar níveis.</p>' +
    '<button type="button" id="focus-go-planning" class="focus-primary">Planejamento ↗</button></div></div>';
  document.body.append(overlay);
  overlay.querySelector('.focus-drawer').append(panel);
  const settings = document.createElement('button');
  settings.id = 'focus-settings';
  settings.type = 'button';
  settings.textContent = '⚙';
  settings.setAttribute('aria-label', 'Preferências');
  settings.setAttribute('aria-expanded', 'false');
  const topbar = $('.topbar');
  if (topbar) topbar.append(settings);
  const importButton = document.createElement('button');
  importButton.id = 'focus-import-button';
  importButton.type = 'button';
  importButton.textContent = 'OFP ↗';
  importButton.setAttribute('aria-expanded', 'false');
  const identity = $('.plan-identity');
  if (identity) identity.append(importButton);
  const read = (selector) => ($(selector)?.textContent || '').trim();
  const msg = (pt, en) => document.documentElement.lang === 'en-US' ? en : pt;
  function setText(id, value) {
    const node = $(id);
    if (node && node.textContent !== value) node.textContent = value;
  }
  let previousHasPlan = null;
  function synchronize() {
    const hasPlan = !$('#plannerContent')?.hidden;
    if (previousHasPlan !== null && previousHasPlan !== hasPlan && hasPlan) document.body.classList.remove('focus-import-open');
    previousHasPlan = hasPlan;
    const hasRanking = !panel.hidden;
    const autoText = hasRanking ? read('#decisionAutoStatus') : '';
    const match = !/desatualiz|stale/i.test(autoText) && autoText.match(/FL\d+\s*[·•]\s*(ECON|NORMAL|FAST)/i);
    const level = match ? match[0].match(/FL\d+/)[0] : hasRanking ? '—' : read('#kpiAltitude') || '—';
    const mode = match ? match[1].toUpperCase() : hasRanking ? 'SEM RECOMENDAÇÃO' : read('#missionScoreMode') || '—';
    const status = read('#feasibilityBadge');
    const confirmed = Boolean(match);
    setText('#focus-level', level);
    setText('#focus-profile', mode);
    setText('#focus-close', '×');
    setText('#focus-recommend-label', confirmed ? msg('RECOMENDADO','RECOMMENDED') : hasRanking ? msg('AVALIAÇÃO','ASSESSMENT') : msg('NÍVEL','LEVEL'));
    setText('#focus-auto-label', confirmed ? 'AUTO' : status);
    const fuelNode = $('#kpiFuel');
    const fuel = fuelNode ? fuelNode.textContent.replace(/\s+/g, ' ').trim() : '—';
    setText('#focus-fuel', fuel);
    setText('#focus-time', read('#kpiTime') || '—');
    setText('#focus-score', read('#missionRiskValue') || '—');
    setText('#focus-ice', read('#cruiseIcingValue') || '—');
    setText('#focus-ride', read('#rideValue') || '—');
    setText('#focus-oxygen', read('#oxygenValue') || '—');
    const applied = /aplicad|applied/i.test(read('#kpiLevelMeta'));
    setText('#focus-applied', applied ? [read('#kpiAltitude'), read('#missionScoreMode')].filter(Boolean).join(' · ') : '—');
    const alternatives = panel.querySelectorAll('#topLevelCards .top-level-card').length;
    const marginals = panel.querySelectorAll('#marginalLevels .top-level-card').length;
    setText('#focus-alternatives', alternatives ? alternatives + msg(' níveis',' levels') : marginals ? marginals + msg(' marginal',' marginal') + (marginals > 1 ? msg('is','s') : '') : '—');
    const explain = $('#focus-explanation');
    let warning = '';
    if (hasRanking && !confirmed) warning = /desatualiz|stale/i.test(autoText) ? 'Ranking desatualizado' : autoText || 'Sem recomendação confirmada';
    if (explain) {
      if (explain.hidden !== !warning) explain.hidden = !warning;
      if (warning && explain.textContent !== warning) explain.textContent = warning;
    }
    const empty = $('#focus-empty');
    if (empty) empty.hidden = hasRanking;
    const compareLabel = hasRanking ? msg('Comparar níveis ↗','Compare levels ↗') : msg('Otimizar missão ↗','Optimize mission ↗');
    setText('#focus-compare', compareLabel);
    setText('.focus-actions .focus-secondary', msg('Detalhes','Details'));
    setText('.focus-checks-title strong', 'Checks');
    setText('.focus-checks-title button', msg('Ver tudo ↗','View all ↗'));
    setText('.focus-pilot .focus-eyebrow', msg('PILOTO','PILOT'));
    const pilotLabels = document.querySelectorAll('.focus-pilot .focus-smalllabel');
    if (pilotLabels[0] && pilotLabels[0].textContent !== msg('Aplicado','Applied')) pilotLabels[0].textContent = msg('Aplicado','Applied');
    if (pilotLabels[1] && pilotLabels[1].textContent !== msg('Alternativas','Alternatives')) pilotLabels[1].textContent = msg('Alternativas','Alternatives');
    setText('#focus-open-comparison', msg('Abrir comparação ↗','Open comparison ↗'));
    setText('.focus-terrain', msg('Terreno e obstáculos: não avaliados.','Terrain and obstacles: not assessed.'));
    setText('.focus-drawer-header strong', msg('Comparar níveis','Compare levels'));
    setText('#focus-import-button', 'OFP ↗');
    if (settings) settings.setAttribute('aria-expanded', String(document.body.classList.contains('focus-settings-open')));
    if (importButton) importButton.setAttribute('aria-expanded', String(document.body.classList.contains('focus-import-open')));
    if (!hasPlan) document.body.classList.add('focus-import-open');
  }
  const sources = ['#kpiAltitude', '#kpiLevelMeta', '#kpiFuel', '#kpiTime', '#missionRiskValue', '#cruiseIcingValue', '#rideValue', '#oxygenValue', '#missionScoreMode', '#feasibilityBadge', '#decisionAutoStatus', '#topLevelCards', '#marginalLevels', '#plannerContent'];
  const watcher = new MutationObserver(synchronize);
  sources.forEach((selector) => {
    const node = $(selector);
    if (node) watcher.observe(node, selector === '#plannerContent' ? { attributes:true, attributeFilter:['hidden'] } : { subtree:true, childList:true, characterData:true, attributes:selector === '#feasibilityBadge' });
  });
  watcher.observe(panel, { attributes:true, attributeFilter:['hidden'] });
  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('focus-drawer-open');
    $('#focus-compare')?.focus({ preventScroll: true });
  }
  function open() {
    if (panel.hidden) {
      window.VelocityLayout?.activate('planning', 'config');
      return;
    }
    overlay.hidden = false;
    document.body.classList.add('focus-drawer-open');
    $('#focus-close')?.focus({ preventScroll: true });
    synchronize();
  }
  $('#focus-compare')?.addEventListener('click', open);
  $('#focus-open-comparison')?.addEventListener('click', open);
  overlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-focus-close]')) close();
    if (event.target.closest('#focus-go-planning')) {
      close();
      window.VelocityLayout?.activate('planning', 'config');
    }
    if (event.target.closest('#applyPilotAlternative')) {
      const apply = $('#applyPilotAlternative');
      if (apply && !apply.disabled && !/marginal|confirmar|confirm/i.test(read('#analysisStatus') + ' ' + read('#applyPilotAlternative'))) close();
      else if (apply && !apply.disabled && /aplicar|apply/i.test(read('#applyPilotAlternative')) && /marginal/i.test(read('#analysisStatus'))) close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); document.body.classList.remove('focus-settings-open'); }
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-area-button]') && !event.target.closest('[data-area-button="mission"]')) {
      close(); document.body.classList.remove('focus-settings-open', 'focus-import-open');
    }
  });
  settings.addEventListener('click', () => {
    document.body.classList.toggle('focus-settings-open');
    synchronize();
  });
  importButton.addEventListener('click', () => {
    document.body.classList.toggle('focus-import-open');
    synchronize();
  });
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setTimeout(synchronize, 0)));
  const moduleOverview = $('[data-module-button="mission:overview"]');
  const moduleScore = $('[data-module-button="mission:score"]');
  function shortTabLabels() {
    if (moduleOverview) moduleOverview.textContent = msg('Resumo','Overview');
    if (moduleScore) moduleScore.textContent = 'Score';
  }
  shortTabLabels();
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setTimeout(shortTabLabels, 0)));
  document.addEventListener('gesturestart', (event) => {
    if (document.querySelector('.app-area[data-area-panel="mission"]:not([hidden])')) event.preventDefault();
  }, { passive: false });
  synchronize();
})();