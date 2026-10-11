import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as bookingCore from '../inspectie-boeken/booking-core.mjs';

const page = fs.readFileSync(new URL('../inspectie-boeken/index.html', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../inspectie-boeken/booking.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const publicConfiguration = fs.readFileSync(new URL('../inspectie-boeken/booking-config.js', import.meta.url), 'utf8');
const connectedConfiguration = { mode: 'connected', apiBase: '/api/consumer-booking' };
const statusToken = 'abcdefghijklmnopqrstuvwxyz_123456';
const recoveryRecord = {
  version: 1, requestId: '2e4fdd95-6013-4a5a-8c8d-867d4e8bea23',
  quoteId: 'test_quote_0123456789', slotId: 's1', currency: 'EUR', totalCents: 36179
};

// This small DOM fake retains the real HTML hierarchy: a message inside a
// hidden form must count as hidden. It does not simulate layout or replace
// the desktop/mobile browser check required before live booking.
class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toLowerCase();
    this.attributes = attributes;
    this.id = attributes.id || '';
    this.className = attributes.class || '';
    this.value = attributes.value || '';
    this.name = attributes.name || '';
    this.type = attributes.type || '';
    this.hidden = Object.hasOwn(attributes, 'hidden');
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.checked = Object.hasOwn(attributes, 'checked');
    this.required = Object.hasOwn(attributes, 'required');
    this.parentElement = null;
    this.childNodes = [];
    this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  get children() { return this.childNodes.filter(node => node instanceof Element); }
  get textContent() {
    return this.childNodes.map(node => node instanceof Element ? node.textContent : node).join('');
  }
  set textContent(text) { this.replaceChildren(String(text)); }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof Element) { node.remove(); node.parentElement = this; }
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.childNodes = this.parentElement.childNodes.filter(node => node !== this);
      this.parentElement = null;
    }
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (/^\[[\w-]+\]$/.test(selector)) return Object.hasOwn(this.attributes, selector.slice(1, -1));
    return this.tagName === selector.toLowerCase();
  }
  querySelectorAll(selectors) {
    const alternatives = selectors.split(',').map(selector => selector.trim());
    return this.children.flatMap(child => [
      ...(alternatives.some(selector => child.matches(selector)) ? [child] : []),
      ...child.querySelectorAll(selectors)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  async dispatch(type) {
    const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const handler of this.listeners.get(type) || []) await handler(event);
    return event;
  }
  reportValidity() { return true; }
  scrollIntoView() {}
  focus() {}
}

function documentFromHtml(html) {
  const document = new Element('#document');
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!')) continue;
    const closing = token.match(/^<\/([\w:-]+)/);
    if (closing) {
      const index = stack.findLastIndex(node => node.tagName === closing[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const opening = token.match(/^<([\w:-]+)([\s\S]*?)\/?\s*>$/);
    if (!opening) { stack.at(-1).append(token); continue; }
    const attributes = {};
    for (const match of opening[2].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    const element = new Element(opening[1], attributes);
    stack.at(-1).append(element);
    if (!voidTags.has(element.tagName) && !token.endsWith('/>')) stack.push(element);
  }
  document.getElementById = id => document.querySelector(`#${id}`);
  document.createElement = tag => new Element(tag);
  return document;
}

function visible(element) {
  for (let current = element; current; current = current.parentElement) {
    if (current.hidden) return false;
  }
  return true;
}

async function settle() {
  // All fetch responses are local resolved promises. Drain their microtasks,
  // without waiting for a network or timer and without rewriting the module.
  await new Promise(setImmediate);
}

async function bookingPage({ configuration, record, returnToken = null, respond, securityReady = true } = {}) {
  const document = documentFromHtml(page);
  const location = new URL(`https://www.roofsignal.nl/inspectie-boeken/${returnToken ? `?booking=${returnToken}` : ''}`);
  const requests = [];
  const navigations = [];
  const storageOperations = [];
  const stored = new Map(record ? [[bookingCore.RECOVERY_STORAGE_KEY, JSON.stringify(record)]] : []);
  const window = {
    RoofSignalFormSecurity: { ensureReady() { if(!securityReady)throw Error('Bevestig eerst dat u geen geautomatiseerde aanvraag verstuurt.');return true; }, getPayload() { return {turnstile_token:'unit-test-only'}; }, reset() {} },
    location: {
      get href() { return location.href; }, get search() { return location.search; },
      assign(url) { navigations.push(String(url)); }
    },
    history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } }
  };
  const context = vm.createContext({
    ...bookingCore, window, document, URL, URLSearchParams, crypto,
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout, AbortSignal: { timeout: () => new AbortController().signal },
    sessionStorage: {
      getItem(key) { storageOperations.push(['get', key]); return stored.get(key) ?? null; },
      setItem(key, value) { storageOperations.push(['set', key]); stored.set(key, value); },
      removeItem(key) { storageOperations.push(['remove', key]); stored.delete(key); }
    },
    fetch: async (url, options = {}) => {
      const request = {
        url: String(url), path: new URL(url, location).pathname,
        method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null
      };
      requests.push(request);
      assert.ok(respond, `Unexpected request in local preview: ${request.path}`);
      // Deliberately no fallback to global fetch: test data never leaves Node.
      const data = await respond(request);
      return Response.json(data);
    }
  });
  vm.runInContext(publicConfiguration, context, { filename: 'booking-config.js' });
  if (configuration !== undefined) window.ROOFSIGNAL_BOOKING = configuration;
  vm.runInContext(controller, context, { filename: 'booking.js' });
  await settle();
  const get = id => {
    const element = document.getElementById(id);
    assert.ok(element, `Missing page element: ${id}`);
    return element;
  };
  return { document, get, requests, navigations, storageOperations, stored };
}

function statusRetry(document) {
  return document.querySelectorAll('button').find(button => visible(button) && !button.disabled && /betaalstatus.*controleren/i.test(button.textContent));
}

const mollieCheckout = 'https://www.mollie.com/checkout/test-payment-identity';
const readyPayment = (overrides = {}) => ({
  ...recoveryRecord, reference: 'ROOFSIGNAL-TEST', state: 'checkout_ready',
  status: 'open', checkoutUrl: mollieCheckout, ...overrides
});

test('A recovered payment exposes a real Betalen anchor for the same Mollie order', async () => {
  const ui = await bookingPage({ configuration: connectedConfiguration, record: recoveryRecord,
    respond(request) {
      assert.ok(request.path.endsWith('/recover'));
      assert.deepEqual(request.body, { requestId: recoveryRecord.requestId });
      return readyPayment();
    }
  });
  const pay = ui.get('checkout-link');
  assert.equal(pay.tagName, 'a');
  assert.equal(pay.textContent, 'Betalen');
  assert.equal(pay.getAttribute('href'), mollieCheckout);
  assert.ok(visible(pay));
  assert.equal(ui.get('checkout-button').hidden, true);
  assert.deepEqual(JSON.parse(ui.stored.get(bookingCore.RECOVERY_STORAGE_KEY)), recoveryRecord);
  assert.equal(ui.requests.length, 1);
  await pay.dispatch('click');
  assert.equal(ui.requests.length, 1, 'Following the existing link must not create or recover a second payment');
  assert.deepEqual(ui.navigations, [], 'Reload must leave the payment choice to the customer');
});

test('Betalen retries a pending order with its original requestId and then exposes its checkout link', async () => {
  let recoveryCalls = 0;
  const ui = await bookingPage({ configuration: connectedConfiguration, record: recoveryRecord,
    respond(request) {
      assert.ok(request.path.endsWith('/recover'));
      assert.deepEqual(request.body, { requestId: recoveryRecord.requestId });
      return ++recoveryCalls === 1 ? { requestId: recoveryRecord.requestId, state: 'pending' } : readyPayment();
    }
  });
  assert.equal(ui.get('checkout-button').textContent, 'Betalen');
  assert.ok(visible(ui.get('checkout-button')));
  assert.equal(ui.get('checkout-link').getAttribute('href'), null);
  assert.equal(ui.get('checkout-link').hidden, true);
  assert.match(ui.get('booking-status').textContent, /betaalpagina wordt klaargezet/i);
  await ui.get('booking-form').dispatch('submit');
  assert.equal(recoveryCalls, 2);
  assert.equal(ui.get('checkout-link').getAttribute('href'), mollieCheckout);
  assert.ok(visible(ui.get('checkout-link')));
  assert.deepEqual(ui.navigations, [mollieCheckout]);
  assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
});

test('The initial Betalen action retains one payment identity and leaves a usable link if navigation is interrupted', async () => {
  const ui = await submitNewOrder(attempt => readyPayment({ requestId: attempt.requestId }));
  assert.equal(ui.get('checkout-link').getAttribute('href'), mollieCheckout);
  assert.ok(visible(ui.get('checkout-link')));
  assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 1);
  assert.deepEqual(ui.navigations, [mollieCheckout]);
  const stored = JSON.parse(ui.stored.get(bookingCore.RECOVERY_STORAGE_KEY));
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(recoveryRecord).sort());
  assert.equal(stored.requestId, ui.requests.find(request => request.path.endsWith('/checkout')).body.requestId);
  assert.equal(stored.checkoutUrl, undefined);
});

test('A Mollie return without local storage exposes its server-identified payment outside the hidden form', async () => {
  const ui = await bookingPage({ configuration: connectedConfiguration, returnToken: statusToken,
    respond(request) {
      assert.ok(request.path.endsWith('/status'));
      return readyPayment();
    }
  });
  assert.equal(ui.get('booking-form').hidden, true);
  assert.ok(visible(ui.get('checkout-link')));
  assert.equal(ui.get('checkout-link').getAttribute('href'), mollieCheckout);
  assert.equal(ui.get('summary-total').textContent, bookingCore.money(recoveryRecord.totalCents));
  assert.equal(ui.stored.size, 0, 'A return response must not store a payment URL or create a new local attempt');
  assert.equal(ui.requests.length, 1);
});

test('Closed, pending or failed status checks remove an earlier payment link', async () => {
  for (const next of [
    { ...readyPayment(), state: 'closed', requestClosed: true, status: 'expired' },
    { requestId: recoveryRecord.requestId, state: 'pending', status: 'pending' },
    new Error('Simulated status failure')
  ]) {
    let statusCalls = 0;
    const ui = await bookingPage({ configuration: connectedConfiguration, returnToken: statusToken,
      respond(request) {
        assert.ok(request.path.endsWith('/status'));
        if (++statusCalls === 1) return readyPayment();
        if (next instanceof Error) throw next;
        return next;
      }
    });
    assert.ok(visible(ui.get('checkout-link')));
    await statusRetry(ui.document).dispatch('click');
    await settle();
    assert.equal(ui.get('checkout-link').hidden, true);
    assert.equal(ui.get('checkout-link').getAttribute('href'), null);
    assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
  }
});

test('Recovery refuses checkout URLs from another host or another order', async () => {
  for (const response of [
    readyPayment({ checkoutUrl: 'https://mollie.com.attacker.invalid/pay' }),
    readyPayment({ checkoutUrl: 'http://www.mollie.com/pay' }),
    readyPayment({ checkoutUrl: 'https://user:secret@www.mollie.com/pay' }),
    readyPayment({ quoteId: 'another_quote_0123456789' }),
    readyPayment({ totalCents: 1 })
  ]) {
    const ui = await bookingPage({ configuration: connectedConfiguration, record: recoveryRecord,
      respond() { return response; }
    });
    assert.equal(ui.get('checkout-link').hidden, true);
    assert.equal(ui.get('checkout-link').getAttribute('href'), null);
    assert.ok(visible(ui.get('booking-error')));
    assert.deepEqual(ui.navigations, []);
    assert.deepEqual(JSON.parse(ui.stored.get(bookingCore.RECOVERY_STORAGE_KEY)), recoveryRecord);
  }
});

test('A return-token payment must match the browser order when a recovery record already exists', async () => {
  const ui = await bookingPage({ configuration: connectedConfiguration, record: recoveryRecord, returnToken: statusToken,
    respond(request) {
      if (request.path.endsWith('/recover')) return readyPayment();
      return readyPayment({ slotId: 'another-slot' });
    }
  });
  assert.equal(ui.get('booking-form').hidden, true);
  assert.equal(ui.get('checkout-link').hidden, true);
  assert.equal(ui.get('checkout-link').getAttribute('href'), null);
  assert.match(ui.get('booking-status').textContent, /hoort niet bij/);
  assert.ok(statusRetry(ui.document));
  assert.deepEqual(ui.navigations, []);
});

test('A confirmed return removes payment and offers only a new inspection without charging again', async () => {
  const ui = await bookingPage({ configuration: connectedConfiguration, record: recoveryRecord, returnToken: statusToken,
    respond(request) {
      if (request.path.endsWith('/recover')) return readyPayment();
      return readyPayment({ state: 'closed', status: 'confirmed', requestClosed: true });
    }
  });
  assert.equal(ui.get('checkout-link').hidden, true);
  assert.equal(ui.get('checkout-link').getAttribute('href'), null);
  assert.equal(ui.get('checkout-button').textContent, 'Een nieuwe inspectie boeken');
  assert.match(ui.get('booking-status').textContent, /betaling is ontvangen/);
  await ui.get('booking-form').dispatch('submit');
  assert.equal(ui.stored.size, 0);
  assert.equal(ui.get('booking-form').hidden, false);
  assert.equal(ui.get('checkout-button').disabled, true);
  assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
});

test('A verified expired return allows a fresh booking with or without a local recovery record', async () => {
  for (const record of [undefined, recoveryRecord]) {
    const ui = await bookingPage({ configuration: connectedConfiguration, record, returnToken: statusToken,
      respond(request) {
        if (request.path.endsWith('/recover')) return { requestId: recoveryRecord.requestId, state: 'pending' };
        return readyPayment({ state: 'closed', status: 'expired', requestClosed: true });
      }
    });
    assert.equal(ui.get('booking-form').hidden, false);
    assert.equal(ui.get('postcode').disabled, false);
    assert.equal(ui.get('check-address').disabled, false);
    assert.equal(ui.get('checkout-button').textContent, 'Betalen');
    assert.equal(ui.get('checkout-button').disabled, true, 'A fresh booking still needs an address, moment and consent');
    assert.equal(ui.get('checkout-link').hidden, true);
    assert.equal(ui.get('checkout-link').getAttribute('href'), null);
    assert.equal(ui.stored.size, 0);
    assert.match(ui.get('booking-status').textContent, /betaalopdracht is verlopen/);
    assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
  }
});

test('Recovery errors after a Mollie return remain visible while the same payment is retained', async () => {
  let recoverCalls = 0;
  const ui = await bookingPage({
    configuration: connectedConfiguration, record: recoveryRecord, returnToken: statusToken,
    respond(request) {
      if (request.path.endsWith('/status')) return { status: 'pending' };
      assert.ok(request.path.endsWith('/recover'));
      assert.deepEqual(request.body, { requestId: recoveryRecord.requestId });
      if (++recoverCalls > 1) throw new Error('Simulated recovery timeout');
      return { requestId: recoveryRecord.requestId, state: 'pending' };
    }
  });
  assert.equal(ui.get('booking-form').hidden, true);
  assert.equal(ui.get('checkout-button').disabled, false);
  await ui.get('booking-form').dispatch('submit');
  await settle();
  assert.match(ui.get('booking-error').textContent, /verbinding is onderbroken/i);
  assert.ok(visible(ui.get('booking-error')), 'Recovery errors must not be hidden with the form');
  assert.equal(ui.get('checkout-button').disabled, false);
  assert.deepEqual(JSON.parse(ui.stored.get(bookingCore.RECOVERY_STORAGE_KEY)), recoveryRecord);
  assert.equal(recoverCalls, 2);
  assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
  assert.deepEqual(ui.navigations, []);
});

test('A failed return-status retry leaves another visible retry without creating a new payment', async () => {
  let statusCalls = 0;
  const ui = await bookingPage({
    configuration: connectedConfiguration, returnToken: statusToken,
    respond(request) {
      assert.ok(request.path.endsWith('/status'));
      if (++statusCalls === 2) throw new Error('Simulated status timeout');
      return { status: 'open' };
    }
  });
  const firstRetry = statusRetry(ui.document);
  assert.ok(firstRetry, 'An open payment must expose a status retry');
  await firstRetry.dispatch('click');
  await settle();
  assert.match(ui.get('booking-status').textContent, /verbinding is onderbroken/i);
  assert.ok(visible(ui.get('booking-status')));
  const nextRetry = statusRetry(ui.document);
  assert.ok(nextRetry, 'A network error must leave status checking available');
  await nextRetry.dispatch('click');
  await settle();
  assert.equal(statusCalls, 3);
  assert.equal(ui.get('booking-form').hidden, true);
  assert.equal(ui.get('checkout-button').disabled, true);
  assert.equal(ui.requests.filter(request => request.path.endsWith('/checkout')).length, 0);
  assert.deepEqual(ui.navigations, []);
});

test('Missing human verification does not send an address or request availability', async () => {
  const ui=await bookingPage({configuration:connectedConfiguration,securityReady:false});
  ui.get('postcode').value='7316BH';ui.get('houseNumber').value='4';
  await ui.get('check-address').dispatch('click');
  assert.equal(ui.requests.length,0);
  assert.match(ui.get('address-status').textContent,/Bevestig eerst/);
});
test('Explicit preview never reads recovery storage or sends customer input', async () => {
  const ui = await bookingPage({ configuration: { mode: 'preview' }, record: recoveryRecord, returnToken: statusToken });
  ui.get('postcode').value = '7316 BH';
  ui.get('houseNumber').value = '4';
  ui.get('name').value = 'Private preview value';
  await ui.get('check-address').dispatch('click');
  const submit = await ui.get('booking-form').dispatch('submit');
  await settle();
  assert.equal(submit.defaultPrevented, true);
  assert.equal(ui.get('checkout-button').disabled, true);
  assert.equal(ui.document.querySelectorAll('input').filter(input => input.name === 'slot').length, 0);
  assert.match(ui.get('address-status').textContent, /conceptpagina/i);
  assert.deepEqual(ui.requests, []);
  assert.deepEqual(ui.storageOperations, []);
  assert.deepEqual(ui.navigations, []);
});

test('An invalid integration destination keeps inputs disabled and sends no request', async () => {
  const ui = await bookingPage({
    configuration: { mode: 'connected', apiBase: 'https://untrusted.invalid/collect' },
    record: recoveryRecord, returnToken: statusToken
  });
  assert.ok(ui.get('booking-form').querySelectorAll('input, textarea, select').every(input => input.disabled));
  assert.equal(ui.get('check-address').disabled, true);
  assert.equal(ui.get('checkout-button').disabled, true);
  assert.ok(visible(ui.get('booking-error')));
  assert.match(ui.get('booking-error').textContent, /niet juist ingesteld/i);
  assert.deepEqual(ui.requests, []);
  assert.deepEqual(ui.storageOperations, []);
});

async function submitNewOrder(checkoutResponse) {
  const quote = {
    quoteId: recoveryRecord.quoteId, serviceable: true, currency: 'EUR',
    baseCents: 36179, thermalCents: 0, travelCents: 0, totalCents: 36179,
    travelDescription: 'Lokale test; geen werkelijke route.', termsVersion: 'test',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    address: {postcode:'1234AB',houseNumber:'12',street:'Teststraat',city:'Testplaats',country:'NL'}
  };
  const slotStart = Date.now() + 30 * 86400000;
  const slot = {id:'s1', start:new Date(slotStart).toISOString(), end:new Date(slotStart+2700000).toISOString()};
  const ui = await bookingPage({configuration:connectedConfiguration, respond(request) {
    if (request.path.endsWith('/quote')) return quote;
    if (request.path.endsWith('/availability')) return {quoteId:quote.quoteId,slots:[slot]};
    assert.ok(request.path.endsWith('/checkout'));
    return checkoutResponse(request.body);
  }});
  ui.get('postcode').value='1234 AB'; ui.get('houseNumber').value='12';
  await ui.get('check-address').dispatch('click');
  const choice = ui.get('slots').querySelector('input');
  assert.ok(choice); await choice.dispatch('change');
  ui.get('name').value='Test'; ui.get('email').value='test@example.invalid';
  ui.get('termsAccepted').checked=true;
  await ui.get('booking-form').dispatch('submit'); await settle();
  return ui;
}

test('A slot lost during checkout releases only a durably closed attempt and invites another choice', async () => {
  const ui=await submitNewOrder(attempt=>({requestId:attempt.requestId,state:'not_created',code:'REQUEST_NOT_CREATED',reason:'SLOT_UNAVAILABLE',paymentCreated:false,requestClosed:true}));
  assert.equal(ui.stored.size,0);
  assert.equal(ui.get('postcode').disabled,false);
  assert.match(ui.get('booking-status').textContent,/inmiddels bezet/);
  assert.equal(ui.get('booking-error').textContent,'');
  assert.deepEqual(ui.navigations,[]);
});

test('A still-pending initial checkout retains the same recovery record without claiming an error or redirect', async () => {
  const ui=await submitNewOrder(attempt=>({requestId:attempt.requestId,state:'pending'}));
  assert.equal(ui.stored.size,1);
  assert.equal(ui.get('postcode').disabled,true);
  assert.match(ui.get('booking-status').textContent,/betaalpagina wordt klaargezet/);
  assert.equal(ui.get('booking-error').textContent,'');
  assert.deepEqual(ui.navigations,[]);
});

test('An initial paid result is shown without recreating or reopening payment', async () => {
  const ui=await submitNewOrder(attempt=>({...attempt,reference:'TEST',currency:'EUR',totalCents:36179,state:'closed',status:'confirmed',requestClosed:true}));
  assert.equal(ui.stored.size,1);
  assert.match(ui.get('booking-status').textContent,/inspectie is geboekt/);
  assert.equal(ui.get('checkout-button').textContent,'Een nieuwe inspectie boeken');
  assert.deepEqual(ui.navigations,[]);
});

async function calendarPage(slots, checkoutResponse = null, inline = false) {
  const quote={quoteId:recoveryRecord.quoteId,serviceable:true,currency:'EUR',baseCents:36179,thermalCents:0,travelCents:0,totalCents:36179,
    travelDescription:'Simulated test route',termsVersion:'test',expiresAt:new Date(Date.now()+600000).toISOString(),
    address:{postcode:'1234AB',houseNumber:'12',street:'Teststraat',city:'Testplaats',country:'NL'}};
  const ui=await bookingPage({configuration:connectedConfiguration,respond(request){
    if(request.path.endsWith('/quote'))return {...quote,...(inline?{availability:{quoteId:inline==='wrong-id'?'another_quote_012345':quote.quoteId,slots}}:{})};
    if(request.path.endsWith('/availability'))return {quoteId:quote.quoteId,slots};
    if(checkoutResponse && request.path.endsWith('/checkout')) return checkoutResponse(request.body);
    assert.fail('No payment should start during calendar selection');
  }});
  ui.get('postcode').value='1234AB';ui.get('houseNumber').value='12';
  await ui.get('check-address').dispatch('click');
  return ui;
}
const calendarButton = (ui, day) => ui.get('calendar-days').querySelectorAll('button').find(button => button.value === day);
const calendarSlot = (id, start, recommended = false) => ({id, start, end:new Date(Date.parse(start)+2700000).toISOString(), recommended});
const futureYear = new Date().getUTCFullYear() + 1;

test('Combined address result opens the real calendar without a second network request',async()=>{
 const ui=await calendarPage([calendarSlot('fast',`${futureYear}-10-14T09:00:00Z`)],null,true);
 assert.equal(ui.get('booking-calendar').hidden,false);
 assert.equal(ui.get('slots').querySelector('input').value,'fast');
 assert.equal(ui.requests.length,1);
 assert.ok(ui.requests[0].path.endsWith('/quote'));
 assert.equal(ui.get('checkout-button').disabled,true,'A customer must still choose a time and consent');
 const empty=await calendarPage([],null,true);
 assert.equal(empty.requests.length,1);
 assert.equal(empty.get('booking-calendar').hidden,true);
 const wrong=await calendarPage([calendarSlot('wrong',`${futureYear}-10-14T09:00:00Z`)],null,'wrong-id');
 assert.equal(wrong.get('booking-calendar').hidden,true);
 assert.equal(wrong.get('checkout-button').disabled,true);
 assert.equal(wrong.requests.length,1,'Invalid inline data is rejected, not silently replaced');
});

test('address details reset while the removed early-start consent is never rendered or preaccepted', async () => {
  const initial = await bookingPage({ configuration: connectedConfiguration });
  assert.equal(initial.get('address-result').hidden, true);
  assert.equal(initial.document.getElementById('early-start-consent'), null);
  assert.equal(initial.document.getElementById('earlyStartRequested'), null);
  assert.doesNotMatch(page, /Boeking herroepen|Ik verzoek RoofSignal om tijdens de bedenktijd te beginnen/);
  assert.equal(initial.get('termsAccepted').checked, false);
  assert.equal(initial.get('termsAccepted').required, true);
  const later = calendarSlot('later', new Date(Date.now() + 30 * 86400000).toISOString());
  const ui = await calendarPage([later]);
  assert.equal(ui.get('address-result').hidden, false);
  assert.equal(ui.get('street').value, 'Teststraat');
  await ui.get('slots').querySelector('input').dispatch('change');
  assert.equal(ui.get('termsAccepted').checked, false);
  assert.equal(ui.get('checkout-button').disabled, true);
  ui.get('termsAccepted').checked = true;
  await ui.get('termsAccepted').dispatch('change');
  assert.equal(ui.get('checkout-button').disabled, false);
  await ui.get('postcode').dispatch('input');
  assert.equal(ui.get('address-result').hidden, true);
  assert.equal(ui.get('street').value, '');
  assert.equal(ui.get('termsAccepted').checked, false);
});

test('Calendar displays only verified dates, retains the recommended day and clears a previous time when changing day',async()=>{
  const first = `${futureYear}-10-14`, second = `${futureYear}-10-15`;
  const ui=await calendarPage([calendarSlot('day-0',first+'T09:00:00Z'),calendarSlot('day-1',second+'T09:00:00Z',true)]);
  assert.equal(ui.get('booking-calendar').hidden,false);
  assert.equal(ui.get('calendar-empty').hidden,true);
  assert.equal(calendarButton(ui,second).getAttribute('aria-pressed'),'true');
  assert.equal(ui.get('slots').querySelectorAll('input').length,1);
  assert.equal(ui.get('slots').querySelector('input').value,'day-1');
  assert.match(ui.get('slots').textContent,/11:00–11:45Aanbevolen/);
  assert.doesNotMatch(ui.get('slots').textContent,/oktober/);
  await ui.get('slots').querySelector('input').dispatch('change');
  assert.notEqual(ui.get('summary-date').textContent,'Nog te kiezen');
  const unavailable=calendarButton(ui,`${futureYear}-10-16`);
  assert.equal(unavailable.disabled,true);
  await unavailable.dispatch('click'); // Handler also guards stale/programmatic events.
  assert.notEqual(ui.get('summary-date').textContent,'Nog te kiezen');
  await calendarButton(ui,first).dispatch('click');
  assert.equal(calendarButton(ui,first).getAttribute('aria-pressed'),'true');
  assert.equal(calendarButton(ui,second).getAttribute('aria-pressed'),'false');
  assert.equal(ui.get('summary-date').textContent,'Nog te kiezen');
  assert.equal(ui.get('checkout-button').disabled,true);
  assert.equal(ui.get('slots').querySelector('input').value,'day-0');
  assert.equal(ui.stored.size,0);
});

test('Month navigation uses a Monday-first grid across years and never invents available days in an empty month',async()=>{
  const december=`${futureYear}-12-31`, february=`${futureYear+1}-02-01`;
  const ui=await calendarPage([calendarSlot('dec',december+'T09:00:00Z'),calendarSlot('feb',february+'T09:00:00Z')]);
  const grid=ui.get('calendar-days');
  assert.equal(grid.children.findIndex(node=>node.tagName==='button'),(new Date(`${futureYear}-12-01T12:00Z`).getUTCDay()+6)%7);
  assert.equal(grid.querySelectorAll('button').length,31);
  assert.equal(ui.get('calendar-previous').disabled,true);
  assert.equal(ui.get('calendar-next').disabled,false);
  await ui.get('slots').querySelector('input').dispatch('change');
  await ui.get('calendar-next').dispatch('click');
  assert.equal(ui.get('calendar-month').textContent,`januari ${futureYear+1}`);
  assert.equal(ui.get('summary-date').textContent,'Nog te kiezen');
  assert.equal(ui.get('calendar-times').hidden,true);
  assert.match(ui.get('slot-status').textContent,/Deze maand zijn er geen beschikbare momenten/);
  assert.equal(ui.get('slots').querySelectorAll('input').length,0);
  assert.ok(grid.querySelectorAll('button').every(button=>button.disabled));
  await ui.get('calendar-next').dispatch('click');
  assert.equal(ui.get('calendar-month').textContent,`februari ${futureYear+1}`);
  assert.equal(ui.get('calendar-next').disabled,true);
  assert.equal(ui.get('slots').querySelector('input').value,'feb');
  assert.equal(calendarButton(ui,february).getAttribute('aria-pressed'),'true');
  await ui.get('calendar-previous').dispatch('click');
  await ui.get('calendar-previous').dispatch('click');
  assert.equal(ui.get('slots').querySelector('input').value,'dec');
  assert.equal(ui.get('summary-date').textContent,'Nog te kiezen');
});

test('Calendar groups dates in Amsterdam, even when the UTC date is the previous day',async()=>{
  const ui=await calendarPage([calendarSlot('local-midnight',`${futureYear}-03-31T22:30:00Z`)]);
  assert.equal(ui.get('calendar-month').textContent,`april ${futureYear}`);
  assert.equal(calendarButton(ui,`${futureYear}-04-01`).disabled,false);
  assert.match(ui.get('slots').textContent,/00:30–01:15/);
  assert.equal(ui.get('calendar-previous').disabled,true);
});

test('Changing an address removes stale calendar choices; an empty availability result offers no selectable time',async()=>{
  const ui=await calendarPage([calendarSlot('old',`${futureYear}-11-03T09:00:00Z`)]);
  const staleInput=ui.get('slots').querySelector('input');
  await staleInput.dispatch('change');
  ui.get('houseNumber').value='14';
  await ui.get('houseNumber').dispatch('input');
  assert.equal(ui.get('booking-calendar').hidden,true);
  assert.equal(ui.get('calendar-empty').hidden,false);
  assert.equal(ui.get('slots').querySelectorAll('input').length,0);
  await staleInput.dispatch('change');
  assert.equal(ui.get('summary-date').textContent,'Nog te kiezen');
  assert.equal(ui.get('checkout-button').disabled,true);
  const empty=await calendarPage([]);
  assert.equal(empty.get('booking-calendar').hidden,true);
  assert.equal(empty.get('slots').querySelectorAll('input').length,0);
  assert.match(empty.get('slot-status').textContent,/geen online momenten/);
});

test('Checkout submits the time chosen in the calendar and locks all calendar controls while payment is pending',async()=>{
  const first=`${futureYear}-11-03`,second=`${futureYear}-11-04`;
  const ui=await calendarPage([calendarSlot('first',first+'T09:00:00Z'),calendarSlot('chosen',second+'T09:00:00Z')],attempt=>({requestId:attempt.requestId,state:'pending'}));
  const firstButton=calendarButton(ui,first);
  await calendarButton(ui,second).dispatch('click');
  await ui.get('slots').querySelector('input').dispatch('change');
  const selectedLabel=ui.get('summary-date').textContent;
  ui.get('termsAccepted').checked=true;
  await ui.get('booking-form').dispatch('submit');
  const checkout = ui.requests.find(request=>request.path.endsWith('/checkout'));
  assert.equal(checkout.body.slotId,'chosen');
  assert.equal(checkout.body.terms.earlyStartRequested,false,'The removed consent must never be silently granted');
  assert.ok(ui.get('booking-calendar').querySelectorAll('button, input').every(control=>control.disabled));
  await firstButton.dispatch('click');
  assert.equal(ui.get('summary-date').textContent,selectedLabel);
  assert.equal(ui.requests.filter(request=>request.path.endsWith('/checkout')).length,1);
});
