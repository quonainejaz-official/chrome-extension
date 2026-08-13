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
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  href?: string;
  /** Ref of the enclosing <form>, if any. */
  formRef?: string;
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
      return 'continue';
    default:
      return 'terminal';
  }
}

/** Caps how much a single model turn may plan, so one bad reply can't run away. */
export const MAX_BATCH_ACTIONS = 8;

// ── Trace ───────────────────────────────────────────────────────

export type AgentStepStatus = 'running' | 'ok' | 'failed' | 'blocked' | 'skipped';

export interface AgentStep {
  id: string;
  index: number;
  /** Short human sentence, e.g. `Clicked "Sign in"`. */
  label: string;
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

/** Human-readable one-liner for a step, used in the trace and confirm card. */
export function describeAction(action: AgentAction, element?: SnapshotElement): string {
  const label = element?.name ? `"${truncate(element.name, 48)}"` : action.type === 'click' ? 'element' : '';

  switch (action.type) {
    case 'click':
      return `Click ${label || 'element'}`;
    case 'fill':
      return `Type into ${label || 'field'}`;
    case 'select':
      return `Choose "${truncate(action.value, 40)}" in ${label || 'dropdown'}`;
    case 'setCheckbox':
      return `${action.checked ? 'Check' : 'Uncheck'} ${label || 'checkbox'}`;
    case 'hover':
      return `Hover ${label || 'element'}`;
    case 'pressKey':
      return `Press ${action.key}`;
    case 'scroll':
      return `Scroll ${action.direction}`;
    case 'scrollToElement':
      return `Scroll to ${label || 'element'}`;
    case 'submit':
      return `Submit form ${label}`.trim();
    case 'navigate':
      return `Open ${truncate(action.url, 60)}`;
    case 'goBack':
      return 'Go back';
    case 'wait':
      return action.text ? `Wait for "${truncate(action.text, 30)}"` : 'Wait';
    case 'readPage':
      return 'Re-read the page';
    case 'ask':
      return 'Ask the user';
    case 'done':
      return 'Finish';
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
