import assert from "node:assert/strict";

function block(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing CSS block: ${marker}`);
  const opening = marker.endsWith("{") ? start + marker.length - 1 : source.indexOf("{", start + marker.length);
  let depth = 1;
  for (let index = opening + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  assert.fail(`Unclosed CSS block: ${marker}`);
}

export function cssRule(css, selector, maxWidth) {
  const source = maxWidth ? block(css, `@media (max-width: ${maxWidth}px)`) : css;
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{`).exec(source);
  assert.ok(match, `Missing CSS selector: ${selector}${maxWidth ? ` at ${maxWidth}px` : ""}`);
  return block(source.slice(match.index + match[0].lastIndexOf(selector)), `${selector} {`);
}

export function assertDeclaration(css, selector, property, value, maxWidth) {
  const declarations = cssRule(css, selector, maxWidth);
  const actual = declarations.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`));
  assert.ok(actual, `Missing ${property} on ${selector}${maxWidth ? ` at ${maxWidth}px` : ""}`);
  assert.equal(actual[1].replace(/\s+/g, ""), value.replace(/\s+/g, ""));
}
