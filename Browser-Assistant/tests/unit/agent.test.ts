import { describe, it, expect } from 'vitest';
import { parseAgentReply, planBatch } from '../../src/background/agent';
import { detectHandoff } from '../../src/background/api-client';
import {
  batchClass,
  isConsequentialAction,
  isHighRiskAction,
  describeAction,
  type PageSnapshot,
  type SnapshotElement,
} from '../../src/shared/actions';

function element(partial: Partial<SnapshotElement>): SnapshotElement {
  return {
    ref: 'e1',
    tag: 'button',
    role: 'button',
    name: '',
    inView: true,
    ...partial,
  };
}

function snapshot(elements: SnapshotElement[], forms: PageSnapshot['forms'] = []): PageSnapshot {
  return {
    url: 'https://example.test/form',
    title: 'Form',
    elements,
    forms,
    text: '',
    scrollY: 0,
    scrollHeight: 1000,
    viewportHeight: 800,
    truncated: false,
    frameCount: 1,
  };
}

/** The single action a reply carries, for the many one-action cases. */
function only(reply: string) {
  const parsed = parseAgentReply(reply);
  return parsed.actions.length === 1 ? parsed.actions[0] : null;
}

describe('parseAgentReply', () => {
  it('parses the documented batch shape', () => {
    const parsed = parseAgentReply(
      '{"thought":"filling the name","actions":[{"type":"fill","ref":"e7","value":"Ada"},{"type":"fill","ref":"e8","value":"Lovelace"}]}'
    );
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.actions[0]).toEqual({ type: 'fill', ref: 'e7', value: 'Ada', pressEnter: false });
    expect(parsed.thought).toBe('filling the name');
  });

  it('still accepts a single action object, as older prompts produced', () => {
    const parsed = parseAgentReply('{"thought":"t","action":{"type":"fill","ref":"e7","value":"a@b.com"}}');
    expect(parsed.actions).toEqual([{ type: 'fill', ref: 'e7', value: 'a@b.com', pressEnter: false }]);
  });

  it('accepts an array under "action", which models emit anyway', () => {
    const parsed = parseAgentReply('{"action":[{"type":"click","ref":"e3"}]}');
    expect(parsed.actions).toEqual([{ type: 'click', ref: 'e3' }]);
  });

  it('accepts a bare top-level array', () => {
    const parsed = parseAgentReply('[{"type":"setCheckbox","ref":"e1","checked":true}]');
    expect(parsed.actions).toEqual([{ type: 'setCheckbox', ref: 'e1', checked: true }]);
  });

  it('unwraps a fence that wraps the whole reply', () => {
    expect(only('```json\n{"action":{"type":"click","ref":"e3"}}\n```')).toEqual({ type: 'click', ref: 'e3' });
  });

  it('does not let a fence inside a done summary hijack extraction', () => {
    const parsed = parseAgentReply(
      '{"actions":[{"type":"done","summary":"Here is the code:\\n```js\\nfoo()\\n```\\nThat is all."}]}'
    );
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({ type: 'done' });
    expect((parsed.actions[0] as { summary: string }).summary).toContain('foo()');
  });

  it('salvages a summary containing raw newlines', () => {
    // Models routinely emit real line breaks inside JSON strings; strict
    // JSON.parse rejects them and the whole run used to abort.
    const parsed = parseAgentReply('{"actions":[{"type":"done","summary":"Line one\nLine two"}]}');
    expect(parsed.actions).toHaveLength(1);
    expect((parsed.actions[0] as { summary: string }).summary).toBe('Line one\nLine two');
  });

  it('accepts a bare action object without the wrapper', () => {
    expect(only('{"type":"scroll","direction":"down"}')).toEqual({ type: 'scroll', direction: 'down', amount: undefined });
  });

  it('ignores prose around the JSON', () => {
    expect(only('I will click it now.\n{"action":{"type":"click","ref":"e12"}}\nHope that helps.')).toEqual({
      type: 'click',
      ref: 'e12',
    });
  });

  it('survives braces inside string values', () => {
    expect(only('{"action":{"type":"fill","ref":"e2","value":"a {weird} value \\" here"}}')).toMatchObject({
      type: 'fill',
      value: 'a {weird} value " here',
    });
  });

  it('normalizes decorated refs', () => {
    expect(only('{"action":{"type":"click","ref":"[e42]"}}')).toEqual({ type: 'click', ref: 'e42' });
    expect(only('{"action":{"type":"click","ref":"#E9"}}')).toEqual({ type: 'click', ref: 'e9' });
  });

  it('accepts common action aliases', () => {
    expect(only('{"action":{"type":"type","ref":"e1","text":"hi"}}')).toMatchObject({ type: 'fill', value: 'hi' });
    expect(only('{"action":{"type":"uncheck","ref":"e1"}}')).toEqual({ type: 'setCheckbox', ref: 'e1', checked: false });
    expect(only('{"action":{"type":"finish","summary":"all done"}}')).toEqual({ type: 'done', summary: 'all done' });
  });

  it('keeps the usable actions when one item in a batch is malformed', () => {
    const parsed = parseAgentReply('{"actions":[{"type":"fill","ref":"e1","value":"x"},{"type":"teleport"}]}');
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({ type: 'fill' });
  });

  it('reads userAuthorized only when explicitly true', () => {
    expect(parseAgentReply('{"action":{"type":"submit","ref":"f1"},"userAuthorized":true}').userAuthorized).toBe(true);
    expect(parseAgentReply('{"action":{"type":"submit","ref":"f1"},"userAuthorized":"yes"}').userAuthorized).toBe(false);
  });

  it('rejects actions missing required fields', () => {
    expect(parseAgentReply('{"action":{"type":"click"}}').actions).toEqual([]);
    expect(parseAgentReply('{"action":{"type":"fill","ref":"e1"}}').actions).toEqual([]);
    expect(parseAgentReply('{"action":{"type":"navigate"}}').actions).toEqual([]);
  });

  it('rejects replies with no JSON at all', () => {
    const parsed = parseAgentReply('I think you should click the blue button.');
    expect(parsed.actions).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it('rejects unknown action types', () => {
    const parsed = parseAgentReply('{"action":{"type":"teleport","ref":"e1"}}');
    expect(parsed.actions).toEqual([]);
    expect(parsed.error).toContain('teleport');
  });
});

describe('batchClass', () => {
  it('lets field edits continue a batch', () => {
    expect(batchClass({ type: 'fill', ref: 'e1', value: 'x' }, element({ role: 'textbox' }))).toBe('continue');
    expect(batchClass({ type: 'setCheckbox', ref: 'e1', checked: true })).toBe('continue');
    expect(batchClass({ type: 'select', ref: 'e1', value: 'UK' }, element({ role: 'select' }))).toBe('continue');
  });

  it('ends a batch on anything the page reacts to', () => {
    expect(batchClass({ type: 'click', ref: 'e1' })).toBe('terminal');
    expect(batchClass({ type: 'submit', ref: 'f1' })).toBe('terminal');
    expect(batchClass({ type: 'fill', ref: 'e1', value: 'x', pressEnter: true })).toBe('terminal');
    // A custom dropdown has to be opened and then picked from.
    expect(batchClass({ type: 'select', ref: 'e1', value: 'UK' }, element({ role: 'button' }))).toBe('terminal');
  });
});

describe('planBatch', () => {
  const page = snapshot([
    element({ ref: 'e1', role: 'textbox', name: 'First name' }),
    element({ ref: 'e2', role: 'textbox', name: 'Last name' }),
    element({ ref: 'e3', role: 'textbox', name: 'Password', sensitive: true }),
    element({ ref: 'e4', role: 'button', name: 'Continue' }),
    element({ ref: 'e5', role: 'textbox', name: 'Notes' }),
  ]);

  it('keeps a run of field edits together', () => {
    const plan = planBatch(
      [
        { type: 'fill', ref: 'e1', value: 'Ada' },
        { type: 'fill', ref: 'e2', value: 'Lovelace' },
      ],
      page,
      60
    );
    expect(plan.actions).toHaveLength(2);
    expect(plan.droppedTail).toBe(0);
  });

  it('cuts the batch after the first page-changing action', () => {
    const plan = planBatch(
      [
        { type: 'fill', ref: 'e1', value: 'Ada' },
        { type: 'click', ref: 'e4' },
        { type: 'fill', ref: 'e5', value: 'never runs' },
      ],
      page,
      60
    );
    expect(plan.actions.map((a) => a.action.type)).toEqual(['fill', 'click']);
    expect(plan.droppedTail).toBe(1);
  });

  it('strips a fill aimed at a locked field without aborting the batch', () => {
    const plan = planBatch(
      [
        { type: 'fill', ref: 'e1', value: 'Ada' },
        { type: 'fill', ref: 'e3', value: 'hunter2' },
        { type: 'fill', ref: 'e2', value: 'Lovelace' },
      ],
      page,
      60
    );
    expect(plan.actions.map((a) => a.action.ref)).toEqual(['e1', 'e2']);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0].element?.name).toBe('Password');
  });

  it('drops a repeat of the same field in one batch', () => {
    const plan = planBatch(
      [
        { type: 'fill', ref: 'e1', value: 'Ada' },
        { type: 'fill', ref: 'e1', value: 'Ada again' },
      ],
      page,
      60
    );
    expect(plan.actions).toHaveLength(1);
  });

  it('respects the remaining action budget', () => {
    const plan = planBatch(
      [
        { type: 'fill', ref: 'e1', value: 'a' },
        { type: 'fill', ref: 'e2', value: 'b' },
        { type: 'fill', ref: 'e5', value: 'c' },
      ],
      page,
      2
    );
    expect(plan.actions).toHaveLength(2);
    expect(plan.droppedTail).toBe(1);
  });

  it('never lets a consequential action sit in the middle of a batch', () => {
    const plan = planBatch(
      [
        { type: 'submit', ref: 'f1' },
        { type: 'fill', ref: 'e1', value: 'too late' },
      ],
      page,
      60
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].action.type).toBe('submit');
  });
});

describe('detectHandoff', () => {
  it('recognises the sentinel as the whole reply', () => {
    expect(detectHandoff('{"handoff":"act","goal":"fill in the signup form"}')).toEqual({
      goal: 'fill in the signup form',
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(detectHandoff('\n  {"handoff":"act","goal":"click submit"}  \n')).toEqual({ goal: 'click submit' });
  });

  it('ignores an answer that merely mentions the sentinel', () => {
    expect(
      detectHandoff('The page has a handoff field. For example {"handoff":"act","goal":"x"} would start a run.')
    ).toBeNull();
  });

  it('ignores a long reply even if it starts and ends with braces', () => {
    const long = '{"handoff":"act","goal":"' + 'x'.repeat(500) + '"}';
    expect(detectHandoff(long)).toBeNull();
  });

  it('ignores ordinary prose and other JSON', () => {
    expect(detectHandoff('This page is a signup form for a service.')).toBeNull();
    expect(detectHandoff('{"answer":"something"}')).toBeNull();
  });
});

describe('isConsequentialAction', () => {
  it('treats submit and navigate as consequential', () => {
    expect(isConsequentialAction({ type: 'submit', ref: 'f1' })).toBe(true);
    expect(isConsequentialAction({ type: 'navigate', url: 'https://example.com' })).toBe(true);
  });

  it('flags clicks on submit inputs and action-worded buttons', () => {
    expect(isConsequentialAction({ type: 'click', ref: 'e1' }, element({ type: 'submit' }))).toBe(true);
    expect(isConsequentialAction({ type: 'click', ref: 'e1' }, element({ name: 'Send message' }))).toBe(true);
    expect(isConsequentialAction({ type: 'click', ref: 'e1' }, element({ name: 'Create account' }))).toBe(true);
  });

  it('leaves ordinary interaction alone', () => {
    expect(isConsequentialAction({ type: 'click', ref: 'e1' }, element({ name: 'Show more' }))).toBe(false);
    expect(isConsequentialAction({ type: 'scroll', direction: 'down' })).toBe(false);
    expect(isConsequentialAction({ type: 'fill', ref: 'e1', value: 'x' }, element({ role: 'textbox' }))).toBe(false);
  });

  it('treats Enter inside a form as a disguised submit', () => {
    const field = element({ role: 'textbox', formRef: 'f1' });
    expect(isConsequentialAction({ type: 'fill', ref: 'e1', value: 'x', pressEnter: true }, field)).toBe(true);
    expect(isConsequentialAction({ type: 'fill', ref: 'e1', value: 'x', pressEnter: true }, element({ role: 'textbox' }))).toBe(false);
  });
});

describe('isHighRiskAction', () => {
  it('flags money and destructive controls', () => {
    expect(isHighRiskAction({ type: 'click', ref: 'e1' }, element({ name: 'Place order' }))).toBe(true);
    expect(isHighRiskAction({ type: 'click', ref: 'e1' }, element({ name: 'Delete my account' }))).toBe(true);
    expect(isHighRiskAction({ type: 'click', ref: 'e1' }, element({ name: 'Pay now' }))).toBe(true);
  });

  it('does not flag ordinary submits', () => {
    expect(isHighRiskAction({ type: 'click', ref: 'e1' }, element({ name: 'Save draft' }))).toBe(false);
    expect(isHighRiskAction({ type: 'submit', ref: 'f1' }, element({ name: 'Contact form' }))).toBe(false);
  });
});

describe('describeAction', () => {
  it('produces a readable label', () => {
    expect(describeAction({ type: 'click', ref: 'e1' }, element({ name: 'Sign in' }))).toBe('Click "Sign in"');
    expect(describeAction({ type: 'setCheckbox', ref: 'e1', checked: false }, element({ name: 'Remember me' }))).toBe(
      'Uncheck "Remember me"'
    );
    expect(describeAction({ type: 'scroll', direction: 'bottom' })).toBe('Scroll bottom');
  });
});
