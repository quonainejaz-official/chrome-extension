import { describe, it, expect } from 'vitest';
import { parseAgentReply } from '../../src/background/agent';
import {
  isConsequentialAction,
  isHighRiskAction,
  describeAction,
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

describe('parseAgentReply', () => {
  it('parses the documented shape', () => {
    const parsed = parseAgentReply('{"thought":"typing the email","action":{"type":"fill","ref":"e7","value":"a@b.com"}}');
    expect(parsed.action).toEqual({ type: 'fill', ref: 'e7', value: 'a@b.com', pressEnter: false });
    expect(parsed.thought).toBe('typing the email');
    expect(parsed.userAuthorized).toBe(false);
  });

  it('unwraps a fenced code block', () => {
    const parsed = parseAgentReply('Sure!\n```json\n{"action":{"type":"click","ref":"e3"}}\n```');
    expect(parsed.action).toEqual({ type: 'click', ref: 'e3' });
  });

  it('accepts a bare action object without the wrapper', () => {
    const parsed = parseAgentReply('{"type":"scroll","direction":"down"}');
    expect(parsed.action).toEqual({ type: 'scroll', direction: 'down', amount: undefined });
  });

  it('ignores prose around the JSON', () => {
    const parsed = parseAgentReply('I will click the button now.\n{"action":{"type":"click","ref":"e12"}}\nHope that helps.');
    expect(parsed.action).toEqual({ type: 'click', ref: 'e12' });
  });

  it('survives braces inside string values', () => {
    const parsed = parseAgentReply('{"action":{"type":"fill","ref":"e2","value":"a {weird} value \\" here"}}');
    expect(parsed.action).toMatchObject({ type: 'fill', value: 'a {weird} value " here' });
  });

  it('normalizes decorated refs', () => {
    expect(parseAgentReply('{"action":{"type":"click","ref":"[e42]"}}').action).toEqual({ type: 'click', ref: 'e42' });
    expect(parseAgentReply('{"action":{"type":"click","ref":"#E9"}}').action).toEqual({ type: 'click', ref: 'e9' });
  });

  it('accepts common action aliases', () => {
    expect(parseAgentReply('{"action":{"type":"type","ref":"e1","text":"hi"}}').action).toMatchObject({ type: 'fill', value: 'hi' });
    expect(parseAgentReply('{"action":{"type":"uncheck","ref":"e1"}}').action).toEqual({ type: 'setCheckbox', ref: 'e1', checked: false });
    expect(parseAgentReply('{"action":{"type":"finish","summary":"all done"}}').action).toEqual({ type: 'done', summary: 'all done' });
  });

  it('reads userAuthorized only when explicitly true', () => {
    expect(parseAgentReply('{"action":{"type":"submit","ref":"f1"},"userAuthorized":true}').userAuthorized).toBe(true);
    expect(parseAgentReply('{"action":{"type":"submit","ref":"f1"},"userAuthorized":"yes"}').userAuthorized).toBe(false);
  });

  it('rejects actions missing required fields', () => {
    expect(parseAgentReply('{"action":{"type":"click"}}').action).toBeNull();
    expect(parseAgentReply('{"action":{"type":"fill","ref":"e1"}}').action).toBeNull();
    expect(parseAgentReply('{"action":{"type":"navigate"}}').action).toBeNull();
  });

  it('rejects replies with no JSON at all', () => {
    const parsed = parseAgentReply('I think you should click the blue button.');
    expect(parsed.action).toBeNull();
    expect(parsed.error).toBeTruthy();
  });

  it('rejects unknown action types', () => {
    const parsed = parseAgentReply('{"action":{"type":"teleport","ref":"e1"}}');
    expect(parsed.action).toBeNull();
    expect(parsed.error).toContain('teleport');
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
