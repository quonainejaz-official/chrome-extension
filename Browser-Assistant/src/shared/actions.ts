// Action vocabulary shared by the agent loop (background), the DOM executor
// (injected into the page) and the side panel UI that renders the trace.
//
// Every action the model may emit is a flat JSON object with a `type`
// discriminator — flat on purpose, because small/free models produce far more
// reliable JSON when there is no nesting to get wrong.

// ── Page snapshot ───────────────────────────────────────────────

export type ElementRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'combobox'
  | 'slider'
  | 'tab'
  | 'menuitem'
  | 'option'
  | 'switch'
  | 'file'
  | 'other';

export interface SnapshotElement {
  /** Stable handle the model uses to address this element, e.g. "e12". */
  ref: string;
  tag: string;
  role: ElementRole;
  /** Accessible name: aria-label, <label>, placeholder, text content… */
  name: string;
  /** `type` attribute for inputs. */
  type?: string;
  /** Current value. Never populated for sensitive fields. */
  value?: string;
  placeholder?: string;
  checked?: boolean;
  /** Choices for <select> / listbox, truncated to a sane number. */
  options?: string[];
  /**
   * Whether the field must be filled. Most real forms mark this with a red
   * asterisk in the label rather than the `required` attribute, so this is
   * inferred from the label too — without it the model has no way to tell a
   * mandatory field from an optional one and shifts values into the wrong box.
   */
  requiredness?: 'required' | 'optional' | 'unknown';
  disabled?: boolean;
  readOnly?: boolean;
  href?: string;
  /** Ref of the enclosing <form>, if any. */
  formRef?: string;
  /**
   * Nearest heading or fieldset legend above the field. Long forms repeat the
   * same labels per section — "Street" for both a registered agent and a
   * member — and without this the model cannot tell those apart.
   */
  section?: string;
  /** Validation message the page is currently showing for this field. */
  error?: string;
  /** Format the field will accept: date pattern, max length, min/max, regex. */
  format?: string;
  /**
   * Shared `name` for radios and checkboxes. Without it, the options of one
   * radio group are indistinguishable from unrelated controls beside them.
   */
  group?: string;
  /**
   * Password, credit card, CVV, SSN and similar. The agent is never allowed to
   * type into these — the user must do it themselves.
   */
  sensitive?: boolean;
  /** Whether the element is currently inside the viewport. */
  inView: boolean;
}

export interface SnapshotForm {
  ref: string;
  name: string;
  action?: string;
  method?: string;
  fieldCount: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: SnapshotElement[];
  forms: SnapshotForm[];
  /** Readable text digest of the page, truncated. */
  text: string;
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
  /** True when the element list hit the cap and was cut short. */
  truncated: boolean;
  /** Number of same-origin iframes that were also scanned. */
  frameCount: number;
  /** Live DOM/runtime diagnostics collected for Developer QA runs. */
  diagnostics?: PageDiagnostics;
}

export interface PageDiagnostics {
  viewport: { width: number; height: number; devicePixelRatio: number };
  layout: {
    documentWidth: number;
    documentHeight: number;
    horizontalOverflow: boolean;
    bodyOverflowX: string;
    fixedOrStickyCount: number;
  };
  accessibility: {
    interactiveWithoutName: number;
    imagesWithoutAlt: number;
    headings: number;
    dialogs: number;
  };
  runtimeErrors: string[];
  failedRequests: string[];
}

// ── Actions ─────────────────────────────────────────────────────

export interface ClickAction {
  type: 'click';
  ref: string;
}

export interface FillAction {
  type: 'fill';
  ref: string;
  value: string;
  /** Press Enter after typing (search boxes, single-field forms). */
  pressEnter?: boolean;
}

export interface SelectAction {
  type: 'select';
  ref: string;
  /** Option value or visible label — matched loosely. */
  value: string;
}

export interface SetCheckboxAction {
  type: 'setCheckbox';
  ref: string;
  checked: boolean;
}

export interface HoverAction {
  type: 'hover';
  ref: string;
}

export interface PressKeyAction {
  type: 'pressKey';
  key: string;
  ref?: string;
}

export interface ScrollAction {
  type: 'scroll';
  direction: 'up' | 'down' | 'top' | 'bottom';
  amount?: number;
}

export interface ScrollToElementAction {
  type: 'scrollToElement';
  ref: string;
}

export interface SubmitAction {
  type: 'submit';
  /** Form ref, or the ref of any field inside the form. */
  ref: string;
}

export interface NavigateAction {
  type: 'navigate';
  url: string;
}

export interface GoBackAction {
  type: 'goBack';
}

export interface WaitAction {
  type: 'wait';
  ms?: number;
  /** Optionally poll until this text appears on the page. */
  text?: string;
}

export interface ReadPageAction {
  type: 'readPage';
}

/**
 * Reveal an element's surroundings without acting on it — the text of the row,
 * card or panel it sits in. Lets the agent answer "what does this say" and
 * "did that work" without a full page re-read.
 */
export interface InspectAction {
  type: 'inspect';
  ref: string;
}

/** Clear a field back to empty — distinct from filling it with "". */
export interface ClearAction {
  type: 'clear';
  ref: string;
}

/**
 * A keyboard chord: Ctrl+A, Meta+Enter, Shift+Tab. Many apps expose actions
 * only through shortcuts, and Tab is how you move through a form the way a
 * person does.
 */
export interface HotkeyAction {
  type: 'hotkey';
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ref?: string;
}

/**
 * Pull structured data off the page — table rows, list items, search results.
 * The point of the agent is not only to fill things in but to get things out.
 */
export interface ExtractAction {
  type: 'extract';
  /** What to pull: "table", "list", or a description the executor matches. */
  target?: string;
  ref?: string;
}

export interface AskAction {
  type: 'ask';
  question: string;
}

export interface DoneAction {
  type: 'done';
  summary: string;
}

export type AgentAction =
  | ClickAction
  | FillAction
  | SelectAction
  | SetCheckboxAction
  | HoverAction
  | PressKeyAction
  | ScrollAction
  | ScrollToElementAction
  | SubmitAction
  | NavigateAction
  | GoBackAction
  | WaitAction
  | ReadPageAction
  | InspectAction
  | ClearAction
  | HotkeyAction
  | ExtractAction
  | AskAction
  | DoneAction;

export type AgentActionType = AgentAction['type'];

/** What the executor reports back after attempting an action. */
export interface ActionResult {
  ok: boolean;
  message: string;
  /** Set when the action caused (or likely caused) a navigation. */
  navigated?: boolean;
  /**
   * The action opened a widget or otherwise changed the page enough that any
   * further action in the same batch would be aiming at stale refs.
   */
  endBatch?: boolean;
}

// ── Batching ────────────────────────────────────────────────────

/**
 * Whether more actions may follow this one inside a single batch.
 *
 * `continue` actions only mutate the field they address, so a whole form can
 * be filled in one model turn. `terminal` actions make the page react —
 * navigating, opening a menu, submitting — after which every ref the model
 * planned against is potentially wrong, so the batch has to stop and re-look.
 */
export type BatchClass = 'continue' | 'terminal';

export function batchClass(action: AgentAction, element?: SnapshotElement): BatchClass {
  switch (action.type) {
    case 'fill':
      // Enter submits or triggers a search — the page reacts.
      return action.pressEnter ? 'terminal' : 'continue';
    case 'select':
      // A real <select> is set in place. A custom dropdown has to be opened
      // and then picked from, which needs a fresh snapshot.
      return element && element.role !== 'select' ? 'terminal' : 'continue';
    case 'setCheckbox':
    case 'scrollToElement':
    case 'clear':
    // Read-only: they cannot change the page, so they never invalidate a ref.
    case 'inspect':
    case 'extract':
      return 'continue';
    default:
      return 'terminal';
  }
}

/**
 * Caps how much a single model turn may plan, so one bad reply cannot run
 * away. Set high enough that a long form is one round-trip rather than
 * several — round-trips are what make a run feel slow and what trip free-tier
 * rate limits.
 */
export const MAX_BATCH_ACTIONS = 25;

// ── Trace ───────────────────────────────────────────────────────

export type AgentStepStatus = 'running' | 'ok' | 'failed' | 'blocked' | 'skipped';

export interface AgentStep {
  id: string;
  index: number;
  /** What happened, past tense: `Typed “Ada” into First name`. */
  label: string;
  /** The same thing before it happens, for the step currently in flight. */
  intent?: string;
  action: AgentAction;
  status: AgentStepStatus;
  detail?: string;
  thought?: string;
}

// ── Risk classification ─────────────────────────────────────────

/**
 * Actions that change state on someone else's server, spend money, or send
 * something on the user's behalf. These never run without an explicit
 * go-ahead — either the user asked for them in the prompt, or they approve
 * the confirmation card in the panel.
 */
const CONSEQUENTIAL_LABEL =
  /\b(submit|send|post|publish|pay|purchase|buy|checkout|order|confirm|place order|subscribe|delete|remove|cancel|transfer|withdraw|deposit|donate|book|reserve|apply|sign\s?up|register|create account|accept|agree|authorize|approve)\b/i;

export function isConsequentialAction(
  action: AgentAction,
  element?: SnapshotElement
): boolean {
  if (action.type === 'submit') return true;
  if (action.type === 'navigate') return true;

  if (action.type === 'click' && element) {
    if (element.type === 'submit' || element.type === 'image') return true;
    if (CONSEQUENTIAL_LABEL.test(element.name)) return true;
  }

  if (action.type === 'fill' && action.pressEnter && element?.formRef) {
    // Enter inside a form is a submit in disguise.
    return true;
  }

  return false;
}

/**
 * Money, irreversible deletion, or anything that publishes on the user's
 * behalf. These always show a confirmation card, whatever the confirm mode is
 * set to — a wrong click here cannot be undone.
 */
const HIGH_RISK_LABEL =
  /\b(pay|payment|purchase|buy|checkout|place order|order now|subscribe|donate|transfer|withdraw|deposit|delete|permanently|close account|deactivate|publish|post|tweet|send money)\b/i;

export function isHighRiskAction(action: AgentAction, element?: SnapshotElement): boolean {
  if (action.type === 'click' || action.type === 'submit') {
    if (element && HIGH_RISK_LABEL.test(element.name)) return true;
  }
  return false;
}

/**
 * Human-readable one-liner for a step, used in the trace and confirm card.
 *
 * These say what was actually done and to what — "Typed 456 Oak Avenue into
 * STREET", not "Type into field". When a run goes wrong, this line is how the
 * user spots it, so the value and the target both have to be in it.
 */
export function describeAction(action: AgentAction, element?: SnapshotElement): string {
  const name = element?.name ? cleanLabel(element.name) : '';
  const into = name ? ` into ${name}` : '';
  const on = name ? ` ${name}` : '';

  switch (action.type) {
    case 'click':
      return name ? `Clicked ${name}` : 'Clicked an element';
    case 'fill':
      return action.value
        ? `Typed “${truncate(action.value, 40)}”${into || ' into a field'}`
        : `Cleared${on || ' a field'}`;
    case 'select':
      return `Chose “${truncate(action.value, 36)}”${name ? ` in ${name}` : ' in a dropdown'}`;
    case 'setCheckbox':
      return `${action.checked ? 'Ticked' : 'Unticked'}${on || ' a checkbox'}`;
    case 'hover':
      return `Hovered${on || ' an element'}`;
    case 'pressKey':
      return `Pressed ${action.key}${name ? ` in ${name}` : ''}`;
    case 'scroll':
      return action.direction === 'top'
        ? 'Scrolled to the top'
        : action.direction === 'bottom'
          ? 'Scrolled to the bottom'
          : `Scrolled ${action.direction}`;
    case 'scrollToElement':
      return `Scrolled to${on || ' an element'}`;
    case 'submit':
      return name ? `Submitted ${name}` : 'Submitted the form';
    case 'navigate':
      return `Opened ${prettyUrl(action.url)}`;
    case 'goBack':
      return 'Went back';
    case 'wait':
      return action.text ? `Waited for “${truncate(action.text, 30)}”` : 'Waited for the page';
    case 'readPage':
      return 'Re-read the page';
    case 'clear':
      return `Cleared${on || ' a field'}`;
    case 'inspect':
      return `Looked at${on || ' an element'}`;
    case 'hotkey':
      return `Pressed ${[action.ctrl && 'Ctrl', action.meta && 'Meta', action.shift && 'Shift', action.alt && 'Alt', action.key].filter(Boolean).join('+')}`;
    case 'extract':
      return name ? `Read the data in ${name}` : 'Read the data on the page';
    case 'ask':
      return 'Asked you a question';
    case 'done':
      return 'Finished';
  }
}

/**
 * The same description before the fact — for the step that is currently
 * running, and for the confirmation card, where "Submitted the form" would be
 * an alarming way to ask permission.
 */
export function describeIntent(action: AgentAction, element?: SnapshotElement): string {
  const name = element?.name ? cleanLabel(element.name) : '';
  const into = name ? ` into ${name}` : '';
  const on = name ? ` ${name}` : '';

  switch (action.type) {
    case 'click':
      return name ? `Click ${name}` : 'Click an element';
    case 'fill':
      return action.value
        ? `Type “${truncate(action.value, 40)}”${into || ' into a field'}`
        : `Clear${on || ' a field'}`;
    case 'select':
      return `Choose “${truncate(action.value, 36)}”${name ? ` in ${name}` : ' in a dropdown'}`;
    case 'setCheckbox':
      return `${action.checked ? 'Tick' : 'Untick'}${on || ' a checkbox'}`;
    case 'submit':
      return name ? `Submit ${name}` : 'Submit the form';
    case 'navigate':
      return `Open ${prettyUrl(action.url)}`;
    case 'goBack':
      return 'Go back';
    case 'pressKey':
      return `Press ${action.key}${name ? ` in ${name}` : ''}`;
    default:
      // The rest read the same either way.
      return describeAction(action, element);
  }
}

/** Labels carry markup noise like a required asterisk; drop it for display. */
function cleanLabel(name: string): string {
  const trimmed = name
    .replace(/\s*\*\s*$/, '')
    .replace(/\s*\(\s*optional\s*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(trimmed, 44);
}

function prettyUrl(url: string): string {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return truncate(parsed.host.replace(/^www\./, '') + (parsed.pathname === '/' ? '' : parsed.pathname), 44);
  } catch {
    return truncate(url, 44);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
