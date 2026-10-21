import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const rootDir = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
const sourceFiles = ['index.html', ...fs.readdirSync(path.join(rootDir, 'js')).filter(name => name.endsWith('.js')).map(name => `js/${name}`)];
const runtimeSources = sourceFiles.map(name => fs.readFileSync(path.join(rootDir, name), 'utf8')).join('\n');
const root = postcss.parse(css, { from: 'styles.css' });
const errors = [];
const notes = [];
const seenRules = new Map();
const declaredTokens = new Map();
let ruleCount = 0;
let declarationCount = 0;

const location = node => `${path.basename(node.source.input.file)}:${node.source.start.line}`;
const report = (code, node, detail) => errors.push({ code, at: location(node), detail });
const declarations = rule => rule.nodes.filter(node => node.type === 'decl');
const normalized = value => value.replace(/\s+/g, ' ').trim().toLowerCase();
const sourceMentions = name => new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(runtimeSources);
const legacySelectors = [
  '.flight-update-grid', '.tool-view-heading', '.tool-close', '.flight-summary',
  '.view-tabs', '.chart-wrap', '.chart-foot', '.route-map', '#verticalProfile',
  '.mini-stats', '.scenario-grid', '.scenario-card', '.scenario-head',
  '.scenario-stats', '.scenario-delta', '.glide-chart', '.cg-legend',
  '.ride-layout', '.ride-levels', '.terrain-chart', '.terrain-axis',
  '.terrain-legend', '.terrain-key', '.terrain-facts', '.terrain-tools',
  '.manual-mode-tabs', '.debrief-result', '.ride-summary', '.ride-level',
  '.manual-mode-top', '.manual-update-strip-icon', '.manual-update-strip-copy',
  '.manual-update-strip-state', '.manual-update-strip-action',
];
const dynamicClasses = /^(ui-icon-(inline|heading|button|card)|ride-(smooth|light|moderate|severe|unknown))$/;

root.walkRules(rule => {
  ruleCount += 1;
  if (!rule.nodes.some(node => node.type === 'decl')) report('empty-rule', rule, rule.selector);
  const context = rule.parent.type === 'atrule' ? `${rule.parent.name} ${rule.parent.params}` : 'base';
  const ruleKey = `${context}|${rule.selector}`;
  if (seenRules.has(ruleKey)) report('repeated-selector', rule, `Previously defined at ${seenRules.get(ruleKey)}`);
  seenRules.set(ruleKey, location(rule));
  for (const match of rule.selector.matchAll(/(?<![\w-])\.([\w-]+)|#([\w-]+)/g)) {
    const name = match[1] || match[2];
    if (!sourceMentions(name) && !dynamicClasses.test(name)) report('unreferenced-selector-token', rule, `${name} has no HTML or JavaScript source`);
  }
  for (const legacy of legacySelectors) {
    if (rule.selector.includes(legacy) && new RegExp(`(^|[^\\w-])${legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(rule.selector)) {
      report('removed-component', rule, `${legacy} belongs to a removed visual component`);
    }
  }
  const list = declarations(rule);
  declarationCount += list.length;
  const byProperty = new Map();
  for (const decl of list) {
    const prop = decl.prop.toLowerCase();
    if (byProperty.has(prop)) report('repeated-property', decl, `${prop} already set at ${location(byProperty.get(prop))}`);
    byProperty.set(prop, decl);
    if (prop.startsWith('--')) {
      if (!decl.parent.selector.includes(':root') && !['--ui-scale', '--score', '--score-color', '--cost-green'].includes(prop)) {
        notes.push({ code: 'local-token', at: location(decl), detail: prop });
      }
      if (!declaredTokens.has(prop)) declaredTokens.set(prop, decl);
    }
    if (prop === 'font-size' && /\b\d+(?:\.\d+)?px\b/.test(decl.value) && rule.selector !== 'html') {
      report('raw-type-size', decl, 'Use the central type scale; document a technical exception if needed');
    }
  }
  const display = byProperty.get('display')?.value;
  if (display === 'grid' || display === 'inline-grid') {
    for (const prop of ['flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis']) {
      if (byProperty.has(prop)) report('inert-display-property', byProperty.get(prop), `${prop} does not affect a Grid container`);
    }
  }
  if (display === 'flex' || display === 'inline-flex') {
    for (const prop of ['grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-rows', 'grid-auto-columns']) {
      if (byProperty.has(prop)) report('inert-display-property', byProperty.get(prop), `${prop} does not affect a Flex container`);
    }
  }
  if (display === 'block' || display === 'inline-block' || display === 'inline') {
    for (const prop of ['grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-rows', 'flex-direction', 'flex-wrap', 'align-items', 'justify-items', 'place-items', 'gap']) {
      if (byProperty.has(prop)) report('inert-display-property', byProperty.get(prop), `${prop} does not affect a ${display} container`);
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    const first = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const later = list[j];
      if (['margin', 'padding'].includes(later.prop) && first.prop.startsWith(`${later.prop}-`)) {
        report('overwritten-longhand', first, `${first.prop} is reset by ${later.prop} at ${location(later)}`);
      }
      if (later.prop === 'font' && /^font-(size|weight|family|style|stretch|variant|line-height)$/.test(first.prop)) {
        report('overwritten-longhand', first, `${first.prop} is reset by font at ${location(later)}`);
      }
      if (later.prop === 'border' && /^border-(color|width|style)$/.test(first.prop)) {
        report('overwritten-longhand', first, `${first.prop} is reset by border at ${location(later)}`);
      }
    }
  }
  const border = byProperty.get('border');
  const color = byProperty.get('border-color');
  if (border && color && border.value !== '0' && normalized(border.value).includes(normalized(color.value))) {
    report('redundant-longhand', color, 'border-color repeats the color already set by border');
  }
  if (border?.value === '0' && color && ![...byProperty.keys()].some(prop => /^border-(top|right|bottom|left)$/.test(prop))) {
    report('inert-border-color', color, 'border-color has no visible border');
  }
  const shorthand = byProperty.get('font');
  if (shorthand) {
    for (const prop of ['font-size', 'font-family', 'font-weight']) {
      const decl = byProperty.get(prop);
      if (!decl) continue;
      if (prop === 'font-size' && normalized(shorthand.value).includes(normalized(decl.value))) report('redundant-longhand', decl, `${prop} repeats font shorthand`);
      if (prop === 'font-family' && normalized(shorthand.value).endsWith(normalized(decl.value))) report('redundant-longhand', decl, `${prop} repeats font shorthand`);
      if (prop === 'font-weight' && normalized(shorthand.value).startsWith(`${normalized(decl.value)} `)) report('redundant-longhand', decl, `${prop} repeats font shorthand`);
    }
  }
});

for (const [token, decl] of declaredTokens) {
  const matches = [...css.matchAll(new RegExp(`var\\(\\s*${token}(?=[\\s,)])`, 'g'))].length;
  const dynamic = runtimeSources.includes(`"${token}"`) || runtimeSources.includes(`'${token}'`);
  if (!matches && !dynamic) report('unused-token', decl, `${token} has no CSS or JavaScript consumer`);
}

const output = { ruleCount, declarationCount, errors, notes };
if (process.argv.includes('--json')) console.log(JSON.stringify(output, null, 2));
else {
  console.log(`${ruleCount} rules, ${declarationCount} declarations; ${errors.length} CSS issues`);
  for (const error of errors) console.log(`${error.at} [${error.code}] ${error.detail}`);
}
if (errors.length) process.exitCode = 1;
