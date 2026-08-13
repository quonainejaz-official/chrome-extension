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

    const val = squash((el as HTMLInputElement).value || '');
    if (val) return clamp(val, 60);

    return '';
  };

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
    if (input.required) entry.required = true;
    if (input.readOnly) entry.readOnly = true;
    if (el.getAttribute('placeholder')) entry.placeholder = clamp(el.getAttribute('placeholder') || '', 80);
    if (sensitive) entry.sensitive = true;

    if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      entry.checked =
        typeof input.checked === 'boolean'
          ? input.checked
          : el.getAttribute('aria-checked') === 'true';
    } else if (role === 'select') {
      const sel = el as unknown as HTMLSelectElement;
      const opts: string[] = [];
      for (const o of Array.from(sel.options || []).slice(0, 60)) {
        opts.push(squash(o.text) || o.value);
      }
      entry.options = opts;
      entry.value = squash(sel.options?.[sel.selectedIndex]?.text || sel.value || '');
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

        if ((el as HTMLElement).isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          const inserted = document.execCommand('insertText', false, action.value);
          if (!inserted) {
            (el as HTMLElement).textContent = action.value;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: action.value }));
          }
        } else if (tag === 'input' || tag === 'textarea') {
          // Clear first so autocomplete widgets re-run their search, but do not
          // fire `change` on the empty value — that trips eager validators.
          setNativeValue(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          setNativeValue(el, action.value);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: action.value }));
          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else {
          return { ok: false, message: 'Element ' + action.ref + ' is not a text field.' };
        }

        if (action.pressEnter) sendKey(el, 'Enter');

        const readBack = (el as HTMLElement).isContentEditable
          ? (el as HTMLElement).innerText
          : (el as HTMLInputElement).value;
        const stuck = (readBack || '').trim() === action.value.trim();
        return {
          ok: true,
          message: stuck
            ? 'Filled "' + nameOf(el) + '".'
            : 'Filled "' + nameOf(el) + '" but the field now reads "' + (readBack || '').slice(0, 60) + '" — it may be reformatting or masking input.',
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
