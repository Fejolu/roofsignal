import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/form-security.js', import.meta.url), 'utf8');

function setup({ narrow = false, configured = true } = {}) {
  const forms = ['consumer', 'lead'].map(type => ({
    type, dataset: { leadForm: type === 'lead' ? 'price' : undefined }, token: '',
    hasAttribute(name) { return name === 'data-consumer-booking' && type === 'consumer'; },
    prepend() {},
    querySelector(selector) {
      if (selector === '.cf-turnstile') return this.widget;
      if (selector.includes('company_website')) return null;
      return { before: widget => { this.widget = widget; } };
    }
  }));
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
