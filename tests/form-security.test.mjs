import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/form-security.js', import.meta.url), 'utf8');

function setup({ narrow = false, configured = true, leadSecuritySlot = false } = {}) {
  const forms = ['consumer', 'lead'].map(type => ({
    type, dataset: { leadForm: type === 'lead' ? 'price' : undefined }, token: '',
    buttonMounts: 0,
    hasAttribute(name) { return name === 'data-consumer-booking' && type === 'consumer'; },
    prepend() {},
    querySelector(selector) {
      if (selector === '.cf-turnstile') return this.widget || null;
      if (selector.includes('company_website')) return null;
      if (selector === '[data-security-slot]') return this.securitySlot || null;
      if (selector === '#check-address' || selector === "button[type='submit']") {
        return { before: widget => { this.widget = widget; this.buttonMounts++; } };
      }
      return null;
    }
  }));
  if (leadSecuritySlot) {
    const lead = forms[1];
    lead.dataset.leadContext = 'vve-object';
    lead.securitySlot = {
      parentElement: lead, children: [],
      append(widget) { this.children.push(widget); widget.parentElement = this; lead.widget = widget; }
    };
  }
  const window = {
    ROOFSIGNAL_SUPABASE: { turnstileSiteKey: configured ? 'test-key' : '' },
    matchMedia: () => ({ matches: narrow }),
    turnstile: { reset(widget) { forms.find(form => form.widget === widget).token = ''; } }
  };
  vm.runInNewContext(source, {
    window,
    document: {
      querySelectorAll: () => forms,
      createElement: () => ({ dataset: {}, hidden: false, setAttribute() {} }),
      head: { append() {} }
    },
    FormData: class { constructor(form) { this.form = form; } get(name) { return name === 'cf-turnstile-response' ? this.form.token : ''; } }
  });
  return { window, consumer: forms[0], lead: forms[1], security: window.RoofSignalFormSecurity };
}

test('a completed consumer check collapses, while renewed interaction and all failure states stay reachable', () => {
  const { window, consumer, lead, security } = setup();
  const widget = consumer.widget;
  assert.equal(widget.dataset.action, 'consumer_quote');
  assert.equal(widget.dataset.appearance, 'interaction-only');
  assert.equal(widget.dataset.language, 'nl');
  assert.equal(widget.dataset.size, 'normal');
  for (const event of ['beforeInteractiveCallback', 'expiredCallback', 'errorCallback', 'timeoutCallback']) {
    window[widget.dataset.callback]();
    assert.equal(widget.hidden, true);
    window[widget.dataset[event]]();
    assert.equal(widget.hidden, false, event);
  }
  consumer.token = 'test-token';
  window[widget.dataset.callback]();
  assert.equal(security.ensureReady(consumer), true);
  assert.equal(security.getPayload(consumer).turnstile_token, 'test-token');
  security.reset(consumer);
  assert.equal(widget.hidden, false);
  assert.throws(() => security.ensureReady(consumer), /Bevestig eerst/);
  assert.equal(lead.widget.dataset.action, 'price');
  assert.equal(lead.widget.dataset.size, 'flexible');
  assert.equal(lead.widget.dataset.callback, undefined);
});

test('narrow screens get the compact check and missing configuration still blocks requests', () => {
  assert.equal(setup({ narrow: true }).consumer.widget.dataset.size, 'compact');
  const { security, consumer } = setup({ configured: false });
  assert.throws(() => security.ensureReady(consumer), /niet geconfigureerd/);
});

test('VvE verification mounts inside its requested form slot and still requires a valid token', () => {
  const { consumer, lead, security } = setup({ leadSecuritySlot: true });
  assert.equal(consumer.buttonMounts, 1, 'Forms without a slot retain their existing widget placement');
  assert.equal(lead.buttonMounts, 0, 'The widget must not alter the VvE summary button layout');
  assert.deepEqual(lead.securitySlot.children, [lead.widget]);
  assert.equal(lead.widget.parentElement, lead.securitySlot);
  assert.equal(lead.securitySlot.parentElement, lead, 'The token stays associated with the protected form');
  assert.equal(lead.widget.dataset.action, 'price');
  assert.equal(lead.dataset.securityReady, 'ready');
  assert.throws(() => security.ensureReady(lead), /Bevestig eerst/);
  lead.token = 'vve-test-token';
  assert.equal(security.ensureReady(lead), true);
  assert.equal(security.getPayload(lead).turnstile_token, 'vve-test-token');
  security.reset(lead);
  assert.equal(lead.widget.hidden, false);
  assert.throws(() => security.ensureReady(lead), /Bevestig eerst/);

  const missing = setup({ leadSecuritySlot: true, configured: false });
  assert.equal(missing.lead.securitySlot.children.length, 0);
  assert.equal(missing.lead.dataset.securityReady, 'missing');
  assert.throws(() => missing.security.ensureReady(missing.lead), /niet geconfigureerd/);
});
