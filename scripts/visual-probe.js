/* Browser-only layout measurements. Loaded by audit-browser.mjs, never by the app. */
window.VelocityVisualProbe = (root = document) => {
  const issues = [];
  const typography = [];
  const visible = element => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const key = element => {
    if (element.id) return `#${element.id}`;
    let parent = element.parentElement;
    while (parent && !parent.id && !parent.classList.length && parent !== root) parent = parent.parentElement;
    const parentName = parent?.id ? `#${parent.id}` : parent?.classList.length ? `.${parent.classList[0]}` : parent?.tagName.toLowerCase();
    return `${parentName || 'root'} > ${element.tagName.toLowerCase()}${element.classList.length ? `.${element.classList[0]}` : ''}`;
  };
  const rectsFor = (node, start = 0, end = node.textContent.length) => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
  };
  const linesFor = element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
  };
  const scoped = selector => [...root.querySelectorAll(selector)].filter(visible);
  const intersects = (a, b, tolerance = 1) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
  const control = element => element?.querySelector('.ui-unit-input, select, input:not([type="range"]):not([type="checkbox"])') || element;

  const roles = scoped('[data-ui-role]');
  const signatures = new Map();
  const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  const expectedRoles = {
    label: { size: 12 * scale, weight: 500, leading: 1.35, tracking: .04 },
    secondary: { size: 14 * scale, weight: 600, leading: 1.35, tracking: 0 },
    emphasis: { size: 16 * scale, weight: 600, leading: 1.35, tracking: 0 },
    primary: { size: 24 * scale, weight: 600, leading: 1.2, tracking: 0 },
  };
  for (const element of roles) {
    const style = getComputedStyle(element);
    const role = element.dataset.uiRole;
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];
    const signature = props.map(property => style[property]);
    const expected = expectedRoles[role];
    if (expected) {
      const size = parseFloat(style.fontSize);
      const leading = parseFloat(style.lineHeight);
      const tracking = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing);
      if (Math.abs(size - expected.size) > .05 || Number(style.fontWeight) !== expected.weight ||
          Math.abs(leading - size * expected.leading) > .15 || Math.abs(tracking - size * expected.tracking) > .05 ||
          style.fontFamily !== getComputedStyle(document.body).fontFamily)
        issues.push({ code: 'role-style-mismatch', target: key(element), detail: `${role}: ${signature.join(' | ')}` });
    }
    const rect = element.getBoundingClientRect();
    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    const textRects = [...textRange.getClientRects()].filter(item => item.width > 0);
    typography.push({ component: key(element), selector: key(element), role,
      fontFamily: signature[0], fontSize: signature[1], fontWeight: signature[2],
      lineHeight: signature[3], letterSpacing: signature[4],
      contentWidth: Math.round(Math.max(element.scrollWidth, ...textRects.map(item => item.width), 0)),
      availableWidth: Math.round(element.clientWidth || rect.width),
      lines: linesFor(element), width: Math.round(rect.width) });
    if (!signatures.has(role)) signatures.set(role, signature);
    else if (signature.some((value, index) => value !== signatures.get(role)[index]))
      issues.push({ code: 'typography-drift', target: key(element), detail: `${role}: ${signature.join(' | ')}` });
    if (style.textOverflow === 'ellipsis')
      issues.push({ code: 'ellipsis', target: key(element) });
    if (['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1)
      issues.push({ code: 'clipped-text', target: key(element), detail: `${element.scrollWidth}/${element.clientWidth}` });
    if (['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1)
      issues.push({ code: 'clipped-vertical', target: key(element), detail: `${element.scrollHeight}/${element.clientHeight}` });
  }

  const pairs = ['#payloadOutput', '#layoutFuelMargin'].map(selector => root.querySelector(selector)).filter(visible);
  if (pairs.length === 2) {
    const one = typography.find(row => row.component === '#payloadOutput');
    const two = typography.find(row => row.component === '#layoutFuelMargin');
    if (one && two && ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some(property => one[property] !== two[property]))
      issues.push({ code: 'secondary-value-mismatch', target: '#payloadOutput / #layoutFuelMargin' });
  }

  for (const element of scoped('input:not([type="range"]):not([type="checkbox"]), select')) {
    const wrapper = element.closest('.ui-unit-input');
    const box = (wrapper || element).getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.height < 43.5) issues.push({ code: 'short-control', target: key(element), detail: String(box.height) });
    if (parseFloat(style.fontSize) < 15.9) issues.push({ code: 'small-editable-text', target: key(element), detail: style.fontSize });
    if (wrapper && parseFloat(style.borderLeftWidth) > 0)
      issues.push({ code: 'double-input-border', target: key(element) });
    if (wrapper && (element.getBoundingClientRect().top < box.top - .5 || element.getBoundingClientRect().bottom > box.bottom + .5))
      issues.push({ code: 'inner-control-outside', target: key(element) });
  }

  // Compare the rectangles that draw the controls, rather than their nested inputs.
  for (const row of scoped('[data-ui-control-row]')) {
    const fields = [...row.children].filter(child => visible(child) && (child.matches('.ui-field, button')));
    const boxes = fields.map(controlElement => ({ element: controlElement, rect: control(controlElement).getBoundingClientRect() }));
    if (innerWidth >= 768 || row.dataset.uiControlRow === 'cost') {
      for (let index = 1; index < boxes.length; index += 1) {
        const a = boxes[0], b = boxes[index];
        for (const edge of ['top', 'bottom', 'height']) {
          if (Math.abs(a.rect[edge] - b.rect[edge]) > 1)
            issues.push({ code: 'control-row-drift', target: key(row), detail: `${key(a.element)} / ${key(b.element)} ${edge} ${a.rect[edge].toFixed(1)}/${b.rect[edge].toFixed(1)}` });
        }
        if (a.element.matches('.ui-field') && b.element.matches('.ui-field')) {
          const appearance = item => {
            const outer = control(item), inner = outer.matches('.ui-unit-input') ? outer.querySelector('input') : outer;
            const boundary = getComputedStyle(outer), type = getComputedStyle(inner);
            return [boundary.borderTopWidth, boundary.borderRadius, type.paddingLeft, type.fontFamily,
              type.fontSize, type.fontWeight, type.lineHeight];
          };
          const first = appearance(a.element), second = appearance(b.element);
          if (first.some((value, property) => value !== second[property]))
            issues.push({ code: 'control-style-drift', target: key(row), detail: `${key(a.element)} ${first.join('/')} / ${key(b.element)} ${second.join('/')}` });
        }
      }
    }
  }
  for (const field of scoped('.ui-field')) {
    const fieldBox = field.getBoundingClientRect();
    const childBox = control(field).getBoundingClientRect();
    if (childBox.bottom > fieldBox.bottom + 1 || childBox.top < fieldBox.top - 1)
      issues.push({ code: 'field-row-underflow', target: key(field) });
  }
  for (const container of scoped('[data-ui-overlap-group]')) {
    const children = [...container.children].filter(visible);
    for (let i = 0; i < children.length; i += 1)
      for (let j = i + 1; j < children.length; j += 1)
        if (intersects(children[i].getBoundingClientRect(), children[j].getBoundingClientRect()))
          issues.push({ code: 'sibling-overlap', target: key(container), detail: `${key(children[i])} / ${key(children[j])}` });
  }
  for (const pair of scoped('[data-ui-card-pair]')) {
    if (getComputedStyle(pair).gridTemplateColumns.split(' ').length < 2) continue;
    const cards = [...pair.children].filter(visible);
    if (cards.length !== 2) continue;
    const a = cards[0].getBoundingClientRect(), b = cards[1].getBoundingClientRect();
    if (Math.abs(a.top - b.top) > 1 || Math.abs(a.bottom - b.bottom) > 1 || Math.abs(a.height - b.height) > 1)
      issues.push({ code: 'card-pair-drift', target: key(pair), detail: `${a.height.toFixed(1)}/${b.height.toFixed(1)}` });
  }
  const costPanel = root.querySelector('#costUnassessed');
  const moneyUnit = root.querySelector('#fuelPriceSymbol');
  if (visible(costPanel) && visible(moneyUnit) && intersects(costPanel.getBoundingClientRect(), moneyUnit.getBoundingClientRect()))
    issues.push({ code: 'unit-panel-collision', target: '#fuelPriceSymbol / #costUnassessed' });
  for (const button of scoped('button')) {
    const boundary = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(button);
    const escaped = [...range.getClientRects()].find(rect => rect.width > 0 &&
        (rect.left < boundary.left - 1 || rect.right > boundary.right + 1 || rect.top < boundary.top - 1 || rect.bottom > boundary.bottom + 1));
    if (escaped) issues.push({ code: 'button-text-outside', target: key(button),
      detail: `${boundary.left.toFixed(1)},${boundary.right.toFixed(1)} / ${escaped.left.toFixed(1)},${escaped.right.toFixed(1)}` });
  }
  for (const element of scoped('.ui-field, .ui-unit-input, .panel, .tool-view, .kpi')) {
    const rect = element.getBoundingClientRect();
    if (rect.left < -1 || rect.right > innerWidth + 1)
      issues.push({ code: 'viewport-overflow', target: key(element), detail: `${rect.left.toFixed(1)}/${rect.right.toFixed(1)}` });
  }

  const textTargets = scoped('[data-ui-role], .app-module strong, .app-module output, .app-module small, button');
  for (const element of textTargets) {
    if (element.scrollWidth > element.clientWidth + 1 && ['hidden', 'clip'].includes(getComputedStyle(element).overflowX))
      issues.push({ code: 'clipped-text', target: key(element), detail: `${element.scrollWidth}/${element.clientWidth}` });
    if (element.scrollHeight > element.clientHeight + 1 && ['hidden', 'clip'].includes(getComputedStyle(element).overflowY))
      issues.push({ code: 'clipped-vertical', target: key(element), detail: `${element.scrollHeight}/${element.clientHeight}` });
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const card = element.closest('.mission-strip > div, .ice-decision-grid > *, .ride-decision-grid > *, .cost-kpis > span, .cost-alternate-grid > span, .kpi, .panel, .tool-view');
    let ancestor = element.parentElement;
    let inScroller = false;
    while (ancestor && ancestor !== card) {
      if (['auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) { inScroller = true; break; }
      ancestor = ancestor.parentElement;
    }
    let node;
    while ((node = walker.nextNode())) {
      const value = node.textContent;
      if (card && !inScroller && visible(card)) {
        const boundary = card.getBoundingClientRect();
        if (rectsFor(node).some(rect => rect.left < boundary.left - 1 || rect.right > boundary.right + 1 ||
            rect.top < boundary.top - 1 || rect.bottom > boundary.bottom + 1))
          issues.push({ code: 'text-outside-card', target: key(element), detail: key(card) });
      }
      if (!inScroller) {
        let clip = element.parentElement;
        while (clip && clip !== document.body) {
          const overflow = getComputedStyle(clip).overflowX;
          if (overflow === 'hidden' || overflow === 'clip') {
            const boundary = clip.getBoundingClientRect();
            if (rectsFor(node).some(rect => rect.left < boundary.left - 1 || rect.right > boundary.right + 1))
              issues.push({ code: 'hidden-overflow', target: key(element), detail: key(clip) });
          }
          clip = clip.parentElement;
        }
      }
      for (const match of value.matchAll(/[+-]?\d[\d.,]*\s+(?:kg|lb|gal|GPH|RPM|kt|NM|inHg|L)\b/gi)) {
        const rects = rectsFor(node, match.index, match.index + match[0].length);
        if (new Set(rects.map(rect => Math.round(rect.top))).size > 1)
          issues.push({ code: 'split-number-unit', target: key(element), detail: match[0] });
      }
    }
  }

  for (const element of scoped('.ui-icon-inline, .ui-icon-heading, .ui-icon-button')) {
    const icon = element.querySelector(':scope > .ui-icon');
    if (!icon || !visible(icon)) continue;
    const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) continue;
    const textBox = rectsFor(textNode).find(rect => rect.width > 0);
    if (!textBox) continue;
    const iconBox = icon.getBoundingClientRect();
    if (iconBox.left < textBox.right - 1 && iconBox.right > textBox.left + 1 &&
        iconBox.top < textBox.bottom - 1 && iconBox.bottom > textBox.top + 1)
      issues.push({ code: 'icon-text-collision', target: key(element) });
  }

  for (const element of scoped('input, select, button, [data-ui-role]')) {
    const container = element.closest('.panel, .tool-view, .kpi, .route-overview-card, .mission-strip > div');
    if (!container || container === element || !visible(container)) continue;
    let scrollAncestor = element.parentElement;
    let intentionallyScrollable = false;
    while (scrollAncestor && scrollAncestor !== container) {
      const overflow = getComputedStyle(scrollAncestor).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') { intentionallyScrollable = true; break; }
      scrollAncestor = scrollAncestor.parentElement;
    }
    if (intentionallyScrollable) continue;
    const child = element.getBoundingClientRect();
    const parent = container.getBoundingClientRect();
    if (child.left < parent.left - 1 || child.right > parent.right + 1 ||
        child.top < parent.top - 1 || child.bottom > parent.bottom + 1)
      issues.push({ code: 'outside-card', target: key(element), detail: key(container) });
  }
  const bottoms = selector => scoped(selector).map(element => Math.round(element.getBoundingClientRect().bottom));
  for (const selector of ['#manualUpdateForm .flight-context-row select, #manualUpdateForm .flight-context-row .ui-unit-input', '#manualUpdateForm .flight-observation-row .ui-unit-input, #manualUpdateForm .flight-observation-row > button']) {
    const values = bottoms(selector);
    if (values.length >= 2 && innerWidth >= 768 && Math.max(...values) - Math.min(...values) > 2)
      issues.push({ code: 'form-baseline-drift', target: selector, detail: values.join(',') });
  }
  return { typography, issues: [...new Map(issues.map(issue => [JSON.stringify(issue), issue])).values()] };
};
