// Functions in this file are SERIALIZED and injected into the target page by
// chrome.scripting.executeScript. That means every one of them must be fully
// self-contained: no imports, no module-scope helpers, no closures. Type-only
// imports are fine because TypeScript erases them.
//
// Keep the code plain ES2020 — it runs in whatever page the user is on.

import type { PageSnapshot, AgentAction, ActionResult } from '../shared/actions';

// ── Snapshot ────────────────────────────────────────────────────

/**
 * Walks the document (including open shadow roots), tags every actionable
 * element with `data-aipa-ref`, and returns a compact description of the page.
 *
 * Refs are re-assigned from scratch on every call, so a snapshot is only valid
 * until the next one — the agent loop always acts on the freshest snapshot.
 */
export function snapshotInPage(
  maxElements: number,
  maxText: number,
  wantText: boolean
): Omit<PageSnapshot, 'frameCount'> {
  const REF = 'data-aipa-ref';
  const FORM_REF = 'data-aipa-form';

  const SENSITIVE_RE =
    /pass(word|wd|phrase)|^pwd$|\bcvv\b|\bcvc\b|card.?number|cardnum|ccnum|credit.?card|security.?code|\bssn\b|social.?security|routing.?number|account.?number|\biban\b|\bpin\b|\botp\b|one.?time.?code|2fa|mfa|verification.?code|secret|api.?key|\btoken\b/i;

  const ACTIONABLE_ROLES = [
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'listbox',
    'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem', 'gridcell',
  ];

  const NATIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'summary'];

  const clamp = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

  const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

  // ── visibility ──
  const isVisible = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false;
    const html = el as HTMLElement;
    if (html.hidden) return false;
    if (html.getAttribute('aria-hidden') === 'true') return false;
    if (html.closest('[aria-hidden="true"],[inert]')) return false;

    let style: CSSStyleDeclaration;
    try {
      style = window.getComputedStyle(html);
    } catch {
      return false;
    }
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (parseFloat(style.opacity || '1') === 0) return false;

    const rect = html.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    return true;
  };

  // ── accessible name ──
  const accessibleName = (el: Element): string => {
    const attr = (n: string) => el.getAttribute(n) || '';

    const aria = squash(attr('aria-label'));
    if (aria) return clamp(aria, 120);

    const labelledBy = attr('aria-labelledby');
    if (labelledBy) {
      const parts: string[] = [];
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) parts.push(node.textContent || '');
      }
      const joined = squash(parts.join(' '));
      if (joined) return clamp(joined, 120);
    }

    if (el.id) {
      let escaped = el.id;
      try {
        escaped = (window as any).CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
      } catch {
        /* keep raw id */
      }
      const forLabel = document.querySelector('label[for="' + escaped + '"]');
      if (forLabel) {
        const t = squash(forLabel.textContent || '');
        if (t) return clamp(t, 120);
      }
    }

    const wrapping = el.closest('label');
    if (wrapping) {
      const t = squash(wrapping.textContent || '');
      if (t) return clamp(t, 120);
    }

    // Plenty of forms render the label as a plain sibling with no `for` and no
    // wrapping — visually obvious, invisible to the DOM association rules.
    // Without this the name fell all the way through to the field's own VALUE,
    // so the model was told a field was called "Wilmington" when that was
    // simply what someone had typed into it.
    const nearby = nearbyLabel(el);
    if (nearby) return clamp(nearby, 120);

    const placeholder = squash(attr('placeholder'));
    if (placeholder) return clamp(placeholder, 120);

    const title = squash(attr('title'));
    if (title) return clamp(title, 120);

    const alt = squash(attr('alt'));
    if (alt) return clamp(alt, 120);

    const text = squash((el as HTMLElement).innerText || el.textContent || '');
    if (text) return clamp(text, 120);

    const img = el.querySelector('img[alt], svg title');
    if (img) {
      const t = squash(img.getAttribute('alt') || img.textContent || '');
      if (t) return clamp(t, 120);
    }

    const nameAttr = squash(attr('name'));
    if (nameAttr) return clamp(nameAttr, 120);

    // A control's value is deliberately NOT a fallback name. Naming a text
    // field after whatever it currently contains is worse than having no name
    // at all — it actively misleads. Buttons are the exception, since their
    // value really is their caption.
    const tag = el.tagName.toLowerCase();
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    if (tag === 'button' || type === 'submit' || type === 'button' || type === 'reset') {
      const val = squash((el as HTMLInputElement).value || '');
      if (val) return clamp(val, 60);
    }

    return '';
  };

  /**
   * Finds the visible label for a control that is not associated with one.
   * Looks at earlier siblings first (labels sit above or to the left), then at
   * ancestors that wrap exactly this one control.
   */
  function nearbyLabel(el: Element): string {
    const CONTROLS = 'input:not([type="hidden"]),select,textarea';
    const textOf = (node: Element): string => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(CONTROLS + ',button').forEach((n) => n.remove());
      return squash(clone.textContent || '');
    };

    let node: Element | null = el;
    for (let depth = 0; node && depth < 4; depth++) {
      let sibling = node.previousElementSibling;
      let scanned = 0;
      while (sibling && scanned < 3) {
        if (!sibling.querySelector(CONTROLS)) {
          const text = textOf(sibling);
          if (text && text.length <= 90) return text;
        }
        sibling = sibling.previousElementSibling;
        scanned++;
      }

      const parent: Element | null = node.parentElement;
      if (!parent) break;

      const controls = parent.querySelectorAll(CONTROLS);
      // A wrapper holding several fields tells us nothing about which is which.
      if (controls.length > 1) break;

      if (controls.length === 1 && controls[0] === el) {
        const label = parent.querySelector('label');
        if (label) {
          const text = textOf(label);
          if (text && text.length <= 90) return text;
        }
        const text = textOf(parent);
        if (text && text.length <= 90) return text;
      }

      node = parent;
    }
    return '';
  }

  // ── role ──
  const roleOf = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'input') {
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'file') return 'file';
      if (t === 'range') return 'slider';
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      return 'textbox';
    }
    const explicit = (el.getAttribute('role') || '').toLowerCase();
    if (explicit === 'searchbox') return 'textbox';
    if (explicit === 'listbox') return 'combobox';
    if (ACTIONABLE_ROLES.indexOf(explicit) >= 0) return explicit;
    if ((el as HTMLElement).isContentEditable) return 'textbox';
    return 'other';
  };

  // Forms overwhelmingly signal "required" with a red asterisk next to the
  // label, and "optional" with the word in parentheses. Reading only the
  // `required` attribute told the model nothing, so it treated every field as
  // equally fillable and shifted values into optional boxes.
  const requirednessOf = (el: Element, name: string): 'required' | 'optional' | 'unknown' => {
    const input = el as HTMLInputElement;
    if (input.required || el.getAttribute('aria-required') === 'true') return 'required';
    if (el.getAttribute('aria-required') === 'false') return 'optional';

    // Look at the label text, plus a small amount of surrounding markup —
    // the asterisk is usually a sibling <span> or <abbr>, not part of the
    // input's own attributes.
    let labelText = name;
    if (el.id) {
      let escaped = el.id;
      try {
        escaped = (window as any).CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
      } catch {
        /* keep raw id */
      }
      const forLabel = document.querySelector('label[for="' + escaped + '"]');
      if (forLabel) labelText += ' ' + (forLabel.textContent || '');
    }
    const wrapping = el.closest('label');
    if (wrapping) labelText += ' ' + (wrapping.textContent || '');

    if (/\boptional\b|\(\s*optional\s*\)/i.test(labelText)) return 'optional';
    if (/\*/.test(labelText) || /\brequired\b/i.test(labelText)) return 'required';
    return 'unknown';
  };

  // Which part of the page a field belongs to. Long forms repeat labels per
  // section, so "Street" alone is ambiguous the moment there are two addresses.
  const sectionOf = (el: Element): string => {
    const HEADINGS = 'h1,h2,h3,h4,h5,h6,legend,[role="heading"]';
    let node: Element | null = el;

    for (let depth = 0; node && depth < 8; depth++) {
      let sibling: Element | null = node.previousElementSibling;
      let scanned = 0;
      while (sibling && scanned < 12) {
        if (sibling.matches(HEADINGS)) {
          const text = squash(sibling.textContent || '');
          if (text) return clamp(text, 60);
        }
        const nested = sibling.querySelector(HEADINGS);
        if (nested) {
          const text = squash(nested.textContent || '');
          if (text) return clamp(text, 60);
        }
        sibling = sibling.previousElementSibling;
        scanned++;
      }

      const parent: Element | null = node.parentElement;
      if (!parent) break;
      const legend = parent.tagName.toLowerCase() === 'fieldset' ? parent.querySelector('legend') : null;
      if (legend) {
        const text = squash(legend.textContent || '');
        if (text) return clamp(text, 60);
      }
      node = parent;
    }
    return '';
  };

  // What the page is currently complaining about for this field. Feeding these
  // back is what lets the agent correct itself against the site's own rules
  // instead of guessing.
  const errorFor = (el: Element): string => {
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      for (const id of describedBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (!node) continue;
        const text = squash(node.textContent || '');
        if (text && text.length < 200) return clamp(text, 160);
      }
    }

    if (el.getAttribute('aria-invalid') !== 'true' && !(el as HTMLInputElement).validationMessage) {
      // Still worth a look: many sites show errors without any ARIA at all.
      const container = el.parentElement;
      if (container) {
        const candidate = container.querySelector('[role="alert"],.error,.invalid,.field-error,.help-block');
        if (candidate) {
          const text = squash(candidate.textContent || '');
          if (text && text.length < 200) return clamp(text, 160);
        }
      }
      return '';
    }

    const native = (el as HTMLInputElement).validationMessage;
    if (native) return clamp(squash(native), 160);

    const alert = el.parentElement?.querySelector('[role="alert"],.error,.invalid,.field-error');
    if (alert) {
      const text = squash(alert.textContent || '');
      if (text) return clamp(text, 160);
    }
    return 'invalid';
  };

  // Constraints the model would otherwise discover only by failing.
  const formatOf = (el: Element): string => {
    const input = el as HTMLInputElement;
    const type = (input.type || '').toLowerCase();
    const parts: string[] = [];

    if (type === 'date') parts.push('YYYY-MM-DD');
    else if (type === 'month') parts.push('YYYY-MM');
    else if (type === 'time') parts.push('HH:MM (24h)');
    else if (type === 'datetime-local') parts.push('YYYY-MM-DDTHH:MM');
    else if (type === 'number' || type === 'range') parts.push('a number');
    else if (type === 'email') parts.push('an email address');
    else if (type === 'url') parts.push('a URL');
    else if (type === 'tel') parts.push('a phone number');

    const pattern = el.getAttribute('pattern');
    if (pattern) parts.push('pattern ' + clamp(pattern, 40));
    const maxLength = el.getAttribute('maxlength');
    if (maxLength && Number(maxLength) > 0 && Number(maxLength) < 500) parts.push('max ' + maxLength + ' chars');
    const min = el.getAttribute('min');
    const max = el.getAttribute('max');
    if (min || max) parts.push('range ' + (min ?? '?') + '–' + (max ?? '?'));

    return parts.join(', ');
  };

  const isSensitiveField = (el: Element): boolean => {
    const parts = [
      (el as HTMLInputElement).type || '',
      el.getAttribute('name') || '',
      el.id || '',
      el.getAttribute('autocomplete') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('aria-label') || '',
    ].join(' ');
    if ((el as HTMLInputElement).type === 'password') return true;
    return SENSITIVE_RE.test(parts);
  };

  // ── collect candidates, descending into open shadow roots ──
  const selector =
    'a[href], button, input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], [role], [onclick]';

  const seen = new Set<Element>();
  const candidates: Element[] = [];
  let shadowBudget = 400;

  const collect = (root: Document | ShadowRoot) => {
    let nodes: NodeListOf<Element>;
    try {
      nodes = root.querySelectorAll(selector);
    } catch {
      return;
    }
    for (const node of Array.from(nodes)) {
      if (!seen.has(node)) {
        seen.add(node);
        candidates.push(node);
      }
    }
    if (shadowBudget <= 0) return;
    let hosts: NodeListOf<Element>;
    try {
      hosts = root.querySelectorAll('*');
    } catch {
      return;
    }
    for (const node of Array.from(hosts)) {
      if (shadowBudget <= 0) break;
      const shadow = (node as HTMLElement).shadowRoot;
      if (shadow) {
        shadowBudget--;
        collect(shadow);
      }
    }
  };
  collect(document);

  // ── clear stale refs ──
  for (const el of Array.from(document.querySelectorAll('[' + REF + '],[' + FORM_REF + ']'))) {
    el.removeAttribute(REF);
    el.removeAttribute(FORM_REF);
  }
  for (const el of seen) {
    if (el.hasAttribute(REF)) el.removeAttribute(REF);
  }

  // ── tag forms ──
  // Forms get their own naming rule: falling back to innerText the way
  // accessibleName does would dump the whole form into the label.
  const formName = (form: HTMLFormElement, index: number): string => {
    const aria = squash(form.getAttribute('aria-label') || '');
    if (aria) return clamp(aria, 80);

    const labelledBy = form.getAttribute('aria-labelledby');
    if (labelledBy) {
      const node = document.getElementById(labelledBy.split(/\s+/)[0]);
      const t = squash(node?.textContent || '');
      if (t) return clamp(t, 80);
    }

    const legend = form.querySelector('legend');
    if (legend) {
      const t = squash(legend.textContent || '');
      if (t) return clamp(t, 80);
    }

    const heading = form.querySelector('h1,h2,h3');
    if (heading) {
      const t = squash(heading.textContent || '');
      if (t) return clamp(t, 80);
    }

    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) {
      const t = squash((submit as HTMLInputElement).value || submit.textContent || '');
      if (t) return clamp(t, 80);
    }

    return squash(form.getAttribute('name') || form.id || '') || 'form ' + index;
  };

  const forms: PageSnapshot['forms'] = [];
  let formCounter = 0;
  const formRefs = new Map<HTMLFormElement, string>();
  for (const form of Array.from(document.querySelectorAll('form'))) {
    if (!isVisible(form)) continue;
    formCounter++;
    const ref = 'f' + formCounter;
    form.setAttribute(FORM_REF, ref);
    formRefs.set(form, ref);
    forms.push({
      ref,
      name: formName(form, formCounter),
      action: form.getAttribute('action') || undefined,
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      fieldCount: form.querySelectorAll('input,select,textarea').length,
    });
  }

  // ── build element list ──
  // A zero here would mark every element "offscreen" and mislead the model
  // into scrolling forever, so fall back to a plausible viewport.
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
  const elements: PageSnapshot['elements'] = [];
  let counter = 0;
  let truncated = false;

  for (const el of candidates) {
    if (elements.length >= maxElements) {
      truncated = true;
      break;
    }

    const tag = el.tagName.toLowerCase();
    const role = roleOf(el);

    // Skip noise: elements that are neither native controls nor carry an
    // actionable role / click handler.
    const isNative = NATIVE_TAGS.indexOf(tag) >= 0;
    const hasClick = el.hasAttribute('onclick');
    if (!isNative && role === 'other' && !hasClick && !(el as HTMLElement).isContentEditable) continue;
    if (tag === 'input' && ((el as HTMLInputElement).type || '').toLowerCase() === 'hidden') continue;
    if (!isVisible(el)) continue;

    counter++;
    const ref = 'e' + counter;
    el.setAttribute(REF, ref);

    const input = el as HTMLInputElement;
    const sensitive = (tag === 'input' || tag === 'textarea') && isSensitiveField(el);
    const rect = el.getBoundingClientRect();

    const entry: PageSnapshot['elements'][number] = {
      ref,
      tag,
      role: role as PageSnapshot['elements'][number]['role'],
      name: accessibleName(el),
      inView: rect.bottom > 0 && rect.top < viewportHeight,
    };

    if (tag === 'input') entry.type = (input.type || 'text').toLowerCase();
    if (input.disabled) entry.disabled = true;
    if (input.readOnly) entry.readOnly = true;
    if (role === 'textbox' || role === 'select' || role === 'combobox' || role === 'checkbox' || role === 'radio') {
      entry.requiredness = requirednessOf(el, entry.name);
      const section = sectionOf(el);
      if (section) entry.section = section;
      const error = errorFor(el);
      if (error) entry.error = error;
      const format = formatOf(el);
      if (format) entry.format = format;
    }
    if (el.getAttribute('placeholder')) entry.placeholder = clamp(el.getAttribute('placeholder') || '', 80);
    if (sensitive) entry.sensitive = true;

    if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      entry.checked =
        typeof input.checked === 'boolean'
          ? input.checked
          : el.getAttribute('aria-checked') === 'true';
      const groupName = squash(el.getAttribute('name') || '');
      if (groupName) entry.group = clamp(groupName, 40);
    } else if (role === 'select') {
      const sel = el as unknown as HTMLSelectElement;
      const opts: string[] = [];
      for (const o of Array.from(sel.options || []).slice(0, 60)) {
        opts.push(squash(o.text) || o.value);
      }
      entry.options = opts;
      // A placeholder row — "Choose…", "-- Select --", value="" — is not a
      // chosen value. Reporting its caption made an untouched required
      // dropdown look filled, so nothing ever prompted the model to set it.
      const selected = sel.options?.[sel.selectedIndex];
      const rawValue = (selected ? selected.value : sel.value) ?? '';
      entry.value = rawValue.trim() ? squash(selected?.text || rawValue) : '';
    } else if (!sensitive && (role === 'textbox' || role === 'combobox')) {
      const raw = (el as HTMLElement).isContentEditable
        ? squash((el as HTMLElement).innerText || '')
        : squash(input.value || '');
      if (raw) entry.value = clamp(raw, 120);
    }

    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).getAttribute('href') || '';
      if (href && href !== '#') entry.href = clamp(href, 120);
    }

    const owningForm = (input.form as HTMLFormElement | null) || el.closest('form');
    if (owningForm && formRefs.has(owningForm as HTMLFormElement)) {
      entry.formRef = formRefs.get(owningForm as HTMLFormElement);
    }

    // Nameless, valueless, optionless controls are noise for the model.
    if (!entry.name && !entry.value && !entry.options && role === 'other') continue;

    elements.push(entry);
  }

  // ── readable text digest ──
  // Skipped on most turns: it ends in document.body.innerText, which forces a
  // full-page layout and materializes the entire rendered document as a string
  // before being sliced down to a few KB.
  let text = '';
  const article = wantText ? (document.querySelector('article') as HTMLElement | null) : null;
  if (!wantText) {
    text = '';
  } else if (article && (article.innerText || '').trim().length > 120) {
    text = article.innerText;
  } else {
    const mains = ['main', '[role="main"]', '#content', '#main-content', '.content', '.main-content'];
    for (const sel of mains) {
      const node = document.querySelector(sel) as HTMLElement | null;
      if (node && (node.innerText || '').trim().length > 200) {
        text = node.innerText;
        break;
      }
    }
    if (!text) text = (document.body && document.body.innerText) || '';
  }

  return {
    url: window.location.href,
    title: document.title || 'Untitled',
    elements,
    forms,
    text: text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxText),
    scrollY: Math.round(window.scrollY),
    scrollHeight: Math.round(document.documentElement.scrollHeight),
    viewportHeight: Math.round(viewportHeight),
    truncated,
  };
}

// ── Action execution ────────────────────────────────────────────

/**
 * Performs a single action against an element previously tagged by
 * `snapshotInPage`. Navigation, waiting and tab-level actions are handled by
 * the background script, not here.
 */
export function actInPage(action: AgentAction): ActionResult {
  const REF = 'data-aipa-ref';
  const FORM_REF = 'data-aipa-form';

  // ── element lookup (searches open shadow roots too) ──
  const deepQuery = (sel: string): Element | null => {
    const direct = document.querySelector(sel);
    if (direct) return direct;
    const stack: (Document | ShadowRoot)[] = [document];
    let budget = 400;
    while (stack.length && budget > 0) {
      const root = stack.pop()!;
      let all: NodeListOf<Element>;
      try {
        all = root.querySelectorAll('*');
      } catch {
        continue;
      }
      for (const node of Array.from(all)) {
        const shadow = (node as HTMLElement).shadowRoot;
        if (!shadow) continue;
        budget--;
        const hit = shadow.querySelector(sel);
        if (hit) return hit;
        stack.push(shadow);
      }
    }
    return null;
  };

  const byRef = (ref: string): Element | null => {
    if (!ref) return null;
    const safe = ref.replace(/"/g, '');
    return deepQuery('[' + REF + '="' + safe + '"]') || deepQuery('[' + FORM_REF + '="' + safe + '"]');
  };

  // These names end up in the model's feedback and in the user's action log,
  // so "I agree to the Terms" beats a checkbox's literal value of "on".
  const nameOf = (el: Element): string => {
    const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
    const clamp = (t: string) => (t.length > 50 ? t.slice(0, 49) + '…' : t);

    const aria = squash(el.getAttribute('aria-label') || '');
    if (aria) return clamp(aria);

    if (el.id) {
      let escaped = el.id;
      try {
        escaped = (window as any).CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
      } catch {
        /* keep raw id */
      }
      const forLabel = document.querySelector('label[for="' + escaped + '"]');
      const t = squash(forLabel?.textContent || '');
      if (t) return clamp(t);
    }

    const wrapping = el.closest('label');
    if (wrapping) {
      const t = squash(wrapping.textContent || '');
      if (t) return clamp(t);
    }

    const tag = el.tagName.toLowerCase();
    const type = ((el as HTMLInputElement).type || '').toLowerCase();

    // A checkbox/radio/select "value" is machine data, not a label.
    const valueIsLabel = tag === 'button' || (tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset'));

    if (tag === 'button' || tag === 'a' || tag === 'summary' || el.getAttribute('role') === 'button') {
      const t = squash((el as HTMLElement).innerText || el.textContent || '');
      if (t) return clamp(t);
    }

    // Same proximity search the snapshot uses. Without it the action log said
    // 'Filled "formed"' — the name attribute — where the snapshot had
    // correctly identified the field as "Date of formation".
    const CONTROLS = 'input:not([type="hidden"]),select,textarea';
    const textOf = (node: Element): string => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(CONTROLS + ',button').forEach((n) => n.remove());
      return squash(copy.textContent || '');
    };
    let node: Element | null = el;
    for (let depth = 0; node && depth < 4; depth++) {
      let sibling = node.previousElementSibling;
      let scanned = 0;
      while (sibling && scanned < 3) {
        if (!sibling.querySelector(CONTROLS)) {
          const text = textOf(sibling);
          if (text && text.length <= 90) return clamp(text);
        }
        sibling = sibling.previousElementSibling;
        scanned++;
      }
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      const controls = parent.querySelectorAll(CONTROLS);
      if (controls.length > 1) break;
      if (controls.length === 1 && controls[0] === el) {
        const text = textOf(parent);
        if (text && text.length <= 90) return clamp(text);
      }
      node = parent;
    }

    const placeholder = squash(el.getAttribute('placeholder') || el.getAttribute('title') || '');
    if (placeholder) return clamp(placeholder);

    if (valueIsLabel) {
      const t = squash((el as HTMLInputElement).value || '');
      if (t) return clamp(t);
    }

    const nameAttr = squash(el.getAttribute('name') || '');
    if (nameAttr) return clamp(nameAttr);

    return clamp(squash((el as HTMLElement).innerText || '') || tag);
  };

  const bring = (el: Element) => {
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    } catch {
      /* older engines */
    }
  };

  const mouseInit = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    } as MouseEventInit;
  };

  const realClick = (el: Element) => {
    bring(el);
    const init = mouseInit(el);
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      /* not focusable */
    }
    el.dispatchEvent(new PointerEvent('pointerover', { ...init, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new MouseEvent('mousemove', init));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, isPrimary: true, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    // Native .click() runs the default action (link navigation, form submit)
    // that a synthetic MouseEvent would not reliably trigger. Not every
    // element type has it — SVG controls, for one.
    if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
    else el.dispatchEvent(new MouseEvent('click', init));
  };

  // Bypass React/Vue value trackers by going through the prototype setter.
  const setNativeValue = (el: Element, value: string) => {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else (el as HTMLInputElement).value = value;
  };

  const fireInput = (el: Element) => {
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };

  const keyInfo = (key: string): { key: string; code: string; keyCode: number } => {
    const map: Record<string, [string, number]> = {
      Enter: ['Enter', 13],
      Tab: ['Tab', 9],
      Escape: ['Escape', 27],
      Backspace: ['Backspace', 8],
      Delete: ['Delete', 46],
      ArrowUp: ['ArrowUp', 38],
      ArrowDown: ['ArrowDown', 40],
      ArrowLeft: ['ArrowLeft', 37],
      ArrowRight: ['ArrowRight', 39],
      ' ': ['Space', 32],
      Space: ['Space', 32],
      Home: ['Home', 36],
      End: ['End', 35],
      PageUp: ['PageUp', 33],
      PageDown: ['PageDown', 34],
    };
    const hit = map[key];
    if (hit) return { key: key === 'Space' ? ' ' : key, code: hit[0], keyCode: hit[1] };
    return { key, code: 'Key' + key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0) || 0 };
  };

  const sendKey = (el: Element, key: string) => {
    const info = keyInfo(key);
    for (const type of ['keydown', 'keypress', 'keyup']) {
      if (type === 'keypress' && info.key.length !== 1) continue;
      const ev = new KeyboardEvent(type, {
        key: info.key,
        code: info.code,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      Object.defineProperty(ev, 'keyCode', { get: () => info.keyCode });
      Object.defineProperty(ev, 'which', { get: () => info.keyCode });
      el.dispatchEvent(ev);
    }
  };

  const scrollableRoot = (): Element | Window => {
    const doc = document.documentElement;
    if (doc.scrollHeight > doc.clientHeight + 8) return window;
    // Some apps scroll an inner container instead of the document. Bounded:
    // getComputedStyle on every div of a large page is genuinely slow.
    let best: Element | null = null;
    let bestArea = 0;
    for (const el of Array.from(document.querySelectorAll('div,main,section,ul,ol')).slice(0, 600)) {
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      const style = window.getComputedStyle(el);
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY);
      if (!scrolls) continue;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best || window;
  };

  // ── dispatch ──
  try {
    switch (action.type) {
      case 'click': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        if ((el as HTMLInputElement).disabled) return { ok: false, message: 'Element ' + action.ref + ' (' + nameOf(el) + ') is disabled.' };
        const before = window.location.href;
        realClick(el);
        return {
          ok: true,
          message: 'Clicked "' + nameOf(el) + '".',
          navigated: window.location.href !== before,
        };
      }

      case 'fill': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Field ' + action.ref + ' no longer exists on the page.' };

        const tag = el.tagName.toLowerCase();
        const type = ((el as HTMLInputElement).type || '').toLowerCase();
        if (type === 'password') {
          return { ok: false, message: 'Refused: this is a password field. The user must type it themselves.' };
        }
        if (type === 'file') {
          return { ok: false, message: 'Refused: file inputs cannot be filled programmatically. Ask the user to choose the file.' };
        }
        // Re-checked here rather than trusting the snapshot: this is the last
        // gate before a card number or an OTP would land in a page field.
        const sensitivePattern =
          /pass(word|wd|phrase)|\bcvv\b|\bcvc\b|card.?number|cardnum|ccnum|credit.?card|security.?code|\bssn\b|social.?security|routing.?number|account.?number|\biban\b|\bpin\b|\botp\b|one.?time.?code|2fa|mfa|verification.?code|secret|api.?key|\btoken\b/i;
        const identity = [
          el.getAttribute('name') || '',
          el.id || '',
          el.getAttribute('autocomplete') || '',
          el.getAttribute('placeholder') || '',
          el.getAttribute('aria-label') || '',
        ].join(' ');
        if (sensitivePattern.test(identity)) {
          return {
            ok: false,
            message:
              'Refused: "' +
              nameOf(el) +
              '" looks like a password, card, ID or one-time-code field. The user must type it themselves.',
          };
        }
        if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) {
          return { ok: false, message: 'Field "' + nameOf(el) + '" is disabled or read-only.' };
        }

        bring(el);
        try {
          (el as HTMLElement).focus({ preventScroll: true });
        } catch {
          /* not focusable */
        }

        // A real user physically cannot exceed maxlength; the value setter can,
        // and the overflow is then silently dropped or rejected on submit.
        const maxLength = Number(el.getAttribute('maxlength') || 0);
        let wanted = action.value;
        let truncated = false;
        if (maxLength > 0 && wanted.length > maxLength) {
          wanted = wanted.slice(0, maxLength);
          truncated = true;
        }

        if ((el as HTMLElement).isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          const inserted = document.execCommand('insertText', false, wanted);
          if (!inserted) {
            (el as HTMLElement).textContent = wanted;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: wanted }));
          }
        } else if (tag === 'input' || tag === 'textarea') {
          // Clear first so autocomplete widgets re-run their search, but do not
          // fire `change` on the empty value — that trips eager validators.
          setNativeValue(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          setNativeValue(el, wanted);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: wanted }));
          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else {
          return { ok: false, message: 'Element ' + action.ref + ' is not a text field.' };
        }

        if (action.pressEnter) sendKey(el, 'Enter');

        const label = nameOf(el);
        const readBack = (
          (el as HTMLElement).isContentEditable ? (el as HTMLElement).innerText : (el as HTMLInputElement).value
        ) || '';

        // The browser rejects a malformed date or number outright and leaves
        // the field empty. Reporting that as success let a batch sail on with
        // required fields silently unfilled.
        if (wanted.trim() && !readBack.trim()) {
          const hint =
            type === 'date' ? ' Dates must be written as YYYY-MM-DD.'
              : type === 'month' ? ' Months must be written as YYYY-MM.'
                : type === 'time' ? ' Times must be written as HH:MM.'
                  : type === 'number' || type === 'range' ? ' This field only accepts digits.'
                    : type === 'email' ? ' This field only accepts an email address.'
                      : type === 'url' ? ' This field only accepts a URL.'
                        : '';
          return {
            ok: false,
            message: 'The browser rejected "' + action.value + '" for "' + label + '" and the field is still empty.' + hint,
          };
        }

        // Constraint violations the setter can bypass but a submit will not.
        let constraint = '';
        const check = el as HTMLInputElement;
        if (typeof check.checkValidity === 'function' && !check.checkValidity()) {
          constraint = ' The page will reject it: ' + (check.validationMessage || 'value does not meet this field’s rules') + '.';
        }

        const notes: string[] = [];
        if (truncated) notes.push('trimmed to the field’s ' + maxLength + '-character limit');
        if (readBack.trim() !== wanted.trim()) notes.push('the field now reads "' + readBack.slice(0, 60) + '"');

        return {
          ok: !constraint,
          message:
            (constraint ? 'Filled "' : 'Filled "') +
            label +
            '" with "' +
            readBack.slice(0, 60) +
            '"' +
            (notes.length ? ' (' + notes.join('; ') + ')' : '') +
            '.' +
            constraint,
        };
      }

      case 'select': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Dropdown ' + action.ref + ' no longer exists on the page.' };

        if (el.tagName.toLowerCase() !== 'select') {
          // Custom dropdown widget — open it so the options become snapshot-able.
          realClick(el);
          return {
            ok: true,
            message: 'This is a custom dropdown, not a native <select>. Opened it — take a fresh look and click the option you want.',
          };
        }

        const sel = el as HTMLSelectElement;
        const wanted = action.value.trim().toLowerCase();
        const opts = Array.from(sel.options);
        const match =
          opts.find((o) => o.value === action.value) ||
          opts.find((o) => o.text.trim() === action.value) ||
          opts.find((o) => o.value.toLowerCase() === wanted) ||
          opts.find((o) => o.text.trim().toLowerCase() === wanted) ||
          opts.find((o) => o.text.trim().toLowerCase().indexOf(wanted) >= 0);

        if (!match) {
          const available = opts.slice(0, 25).map((o) => o.text.trim()).join(' | ');
          return { ok: false, message: 'No option matching "' + action.value + '". Available: ' + available };
        }

        bring(sel);
        setNativeValue(sel, match.value);
        match.selected = true;
        fireInput(sel);
        return { ok: true, message: 'Selected "' + match.text.trim() + '" in "' + nameOf(sel) + '".' };
      }

      case 'setCheckbox': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Checkbox ' + action.ref + ' no longer exists on the page.' };
        if ((el as HTMLInputElement).disabled) return { ok: false, message: '"' + nameOf(el) + '" is disabled.' };

        const input = el as HTMLInputElement;
        const isNative = typeof input.checked === 'boolean' && el.tagName.toLowerCase() === 'input';
        const current = isNative ? input.checked : el.getAttribute('aria-checked') === 'true';

        if (current === action.checked) {
          return { ok: true, message: '"' + nameOf(el) + '" was already ' + (action.checked ? 'checked' : 'unchecked') + '.' };
        }

        realClick(el);
        const after = isNative ? input.checked : el.getAttribute('aria-checked') === 'true';
        return {
          ok: after === action.checked,
          message:
            after === action.checked
              ? (action.checked ? 'Checked "' : 'Unchecked "') + nameOf(el) + '".'
              : 'Clicked "' + nameOf(el) + '" but its state did not change.',
        };
      }

      case 'hover': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        bring(el);
        const init = mouseInit(el);
        el.dispatchEvent(new PointerEvent('pointerover', { ...init, pointerId: 1, isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mouseover', init));
        el.dispatchEvent(new MouseEvent('mousemove', init));
        el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
        return { ok: true, message: 'Hovering "' + nameOf(el) + '".' };
      }

      case 'pressKey': {
        const el = action.ref ? byRef(action.ref) : document.activeElement || document.body;
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        const before = window.location.href;
        sendKey(el, action.key);
        return { ok: true, message: 'Pressed ' + action.key + '.', navigated: window.location.href !== before };
      }

      case 'scroll': {
        const target = scrollableRoot();
        const amount = action.amount ?? Math.round((window.innerHeight || 800) * 0.8);
        const isWindow = target === window;
        const currentTop = isWindow ? window.scrollY : (target as Element).scrollTop;
        const maxTop = isWindow
          ? document.documentElement.scrollHeight - window.innerHeight
          : (target as Element).scrollHeight - (target as Element).clientHeight;

        let top = currentTop;
        if (action.direction === 'down') top = currentTop + amount;
        else if (action.direction === 'up') top = currentTop - amount;
        else if (action.direction === 'top') top = 0;
        else top = maxTop;

        top = Math.max(0, Math.min(top, maxTop));
        if (isWindow) window.scrollTo({ top, behavior: 'auto' });
        else (target as Element).scrollTo({ top, behavior: 'auto' });

        const atEnd = top >= maxTop - 4;
        return {
          ok: true,
          message: 'Scrolled ' + action.direction + '. Position ' + Math.round(top) + '/' + Math.round(maxTop) + (atEnd ? ' (bottom of page)' : ''),
        };
      }

      case 'scrollToElement': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        bring(el);
        return { ok: true, message: 'Scrolled to "' + nameOf(el) + '".' };
      }

      case 'submit': {
        const target = byRef(action.ref);
        if (!target) return { ok: false, message: 'Form ' + action.ref + ' no longer exists on the page.' };

        const form =
          target.tagName.toLowerCase() === 'form'
            ? (target as HTMLFormElement)
            : ((target as HTMLInputElement).form as HTMLFormElement | null) || target.closest('form');

        if (!form) {
          return { ok: false, message: 'No <form> found for ' + action.ref + '. Click the submit button directly instead.' };
        }

        const button = form.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type]):not([disabled])'
        ) as HTMLElement | null;

        const before = window.location.href;
        if (typeof (form as any).requestSubmit === 'function') {
          // requestSubmit runs native validation and fires the submit event —
          // form.submit() skips both.
          if (button && (button as HTMLButtonElement).type !== 'button') (form as any).requestSubmit(button);
          else (form as any).requestSubmit();
        } else if (button) {
          button.click();
        } else {
          form.submit();
        }

        const invalid = form.querySelector(':invalid') as HTMLElement | null;
        if (invalid && window.location.href === before) {
          return {
            ok: false,
            message: 'Submit was blocked by validation. Invalid field: "' + nameOf(invalid) + '".',
          };
        }
        return { ok: true, message: 'Submitted the form.', navigated: window.location.href !== before };
      }

      case 'clear': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Field ' + action.ref + ' no longer exists on the page.' };
        try {
          (el as HTMLElement).focus({ preventScroll: true });
        } catch {
          /* not focusable */
        }
        if ((el as HTMLElement).isContentEditable) {
          (el as HTMLElement).textContent = '';
        } else {
          setNativeValue(el, '');
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return { ok: true, message: 'Cleared "' + nameOf(el) + '".' };
      }

      case 'inspect': {
        const el = byRef(action.ref);
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        // Climb only until the surroundings say something. Going further keeps
        // widening until it returns the whole page, which is useless — the
        // point of inspect is the row or card, not the document.
        let node: Element = el;
        let text = '';
        for (let depth = 0; depth < 4; depth++) {
          const parent = node.parentElement;
          if (!parent || parent === document.body || parent === document.documentElement) break;
          node = parent;
          const candidate = ((node as HTMLElement).innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
          if (candidate.length >= 25) {
            text = candidate;
            break;
          }
          text = candidate || text;
        }
        return {
          ok: true,
          message: 'Around "' + nameOf(el) + '": ' + (text ? text.slice(0, 500) : '(no surrounding text)'),
        };
      }

      case 'hotkey': {
        const el = action.ref ? byRef(action.ref) : document.activeElement || document.body;
        if (!el) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };
        const before = window.location.href;
        const info = keyInfo(action.key);
        for (const type of ['keydown', 'keyup']) {
          const ev = new KeyboardEvent(type, {
            key: info.key,
            code: info.code,
            bubbles: true,
            cancelable: true,
            composed: true,
            ctrlKey: !!action.ctrl,
            metaKey: !!action.meta,
            shiftKey: !!action.shift,
            altKey: !!action.alt,
          });
          Object.defineProperty(ev, 'keyCode', { get: () => info.keyCode });
          Object.defineProperty(ev, 'which', { get: () => info.keyCode });
          el.dispatchEvent(ev);
        }
        const combo =
          [action.ctrl && 'Ctrl', action.meta && 'Meta', action.shift && 'Shift', action.alt && 'Alt', action.key]
            .filter(Boolean)
            .join('+');
        return { ok: true, message: 'Pressed ' + combo + '.', navigated: window.location.href !== before };
      }

      case 'extract': {
        const scope = action.ref ? byRef(action.ref) : document.body;
        if (!scope) return { ok: false, message: 'Element ' + action.ref + ' no longer exists on the page.' };

        // A cell's text excludes what is typed into any control inside it, so
        // read those out too — otherwise extracting a filled-in table returns
        // only the column headings.
        const cellText = (cell: Element): string => {
          const own = ((cell as HTMLElement).innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
          const entered: string[] = [];
          for (const control of Array.from(cell.querySelectorAll('input,select,textarea'))) {
            const field = control as HTMLInputElement;
            if ((field.type || '').toLowerCase() === 'hidden') continue;
            if (field.type === 'checkbox' || field.type === 'radio') {
              entered.push(field.checked ? '[x]' : '[ ]');
            } else if (field.value) {
              entered.push(field.value);
            }
          }
          return [own, entered.join(' ')].filter(Boolean).join(' ').trim();
        };

        const rows: string[] = [];
        const tables = Array.from(scope.querySelectorAll('table')).slice(0, 3);
        for (const table of tables) {
          for (const tr of Array.from(table.querySelectorAll('tr')).slice(0, 40)) {
            const cells = Array.from(tr.querySelectorAll('th,td')).map(cellText).filter(Boolean);
            if (cells.length) rows.push(cells.join(' | '));
          }
          if (rows.length) rows.push('');
        }

        if (rows.length === 0) {
          const items = Array.from(scope.querySelectorAll('li,[role="listitem"],[role="row"]')).slice(0, 60);
          for (const item of items) {
            const text = ((item as HTMLElement).innerText || item.textContent || '').replace(/\s+/g, ' ').trim();
            if (text && text.length < 300) rows.push('- ' + text);
          }
        }

        if (rows.length === 0) {
          return { ok: false, message: 'Found no table or list to extract here. Use readPage for prose.' };
        }
        return { ok: true, message: 'Extracted ' + rows.length + ' rows:\n' + rows.join('\n').slice(0, 4000) };
      }

      case 'wait':
      case 'readPage':
      case 'navigate':
      case 'goBack':
      case 'ask':
      case 'done':
        return { ok: true, message: 'Handled outside the page.' };
    }
  } catch (err) {
    return { ok: false, message: 'Action threw: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

/** Cheap text-presence probe used by the `wait` action. */
export function hasTextInPage(needle: string): boolean {
  const body = document.body ? document.body.innerText || '' : '';
  return body.toLowerCase().indexOf(needle.toLowerCase()) >= 0;
}
