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

async function bookingPage({ configuration, record, returnToken = null, respond } = {}) {
  const document = documentFromHtml(page);
  const location = new URL(`https://www.roofsignal.nl/inspectie-boeken/${returnToken ? `?booking=${returnToken}` : ''}`);
  const requests = [];
  const navigations = [];
  const storageOperations = [];
  const stored = new Map(record ? [[bookingCore.RECOVERY_STORAGE_KEY, JSON.stringify(record)]] : []);
  const window = {
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

test('The checked-in preview never reads recovery storage or sends customer input', async () => {
  const ui = await bookingPage({ record: recoveryRecord, returnToken: statusToken });
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
  const slot = {id:'s1', start:new Date(Date.now()+86400000).toISOString(), end:new Date(Date.now()+89100000).toISOString()};
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
  ui.get('termsAccepted').checked=true; ui.get('earlyStartRequested').checked=true;
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
  assert.match(ui.get('booking-status').textContent,/nog gecontroleerd/);
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

test('Changing the available day clears the old slot and renders only that day',async()=>{
  const first=new Date(Date.now()+3*86400000);first.setUTCHours(9,0,0,0);
  const second=new Date(first.getTime()+86400000);
  const slots=[first,second].map((date,i)=>({id:'day-'+i,start:date.toISOString(),end:new Date(date.getTime()+2700000).toISOString(),recommended:i===1}));
  const quote={quoteId:recoveryRecord.quoteId,serviceable:true,currency:'EUR',baseCents:36179,thermalCents:0,travelCents:0,totalCents:36179,
    travelDescription:'Simulated test route',termsVersion:'test',expiresAt:new Date(Date.now()+600000).toISOString(),
    address:{postcode:'1234AB',houseNumber:'12',street:'Teststraat',city:'Testplaats',country:'NL'}};
  const ui=await bookingPage({configuration:connectedConfiguration,respond(request){
    if(request.path.endsWith('/quote'))return quote;
    if(request.path.endsWith('/availability'))return {quoteId:quote.quoteId,slots};
    assert.fail('No payment should start during day selection');
  }});
  ui.get('postcode').value='1234AB';ui.get('houseNumber').value='12';
  await ui.get('check-address').dispatch('click');
  const selector=ui.get('slot-day');
  assert.equal(selector.hidden,false);assert.equal(selector.children.length,2);
  assert.match(selector.children[0].textContent,/Aanbevolen/);
  assert.equal(ui.get('slots').querySelectorAll('input').length,1);
  assert.equal(ui.get('slots').querySelector('input').value,'day-1');
  await ui.get('slots').querySelector('input').dispatch('change');
  assert.notEqual(ui.get('summary-date').textContent,'Nog te kiezen');
  selector.value=selector.children[1].value;await selector.dispatch('change');
  assert.equal(ui.get('summary-date').textContent,'Nog te kiezen');
  assert.equal(ui.get('checkout-button').disabled,true);
  assert.equal(ui.get('slots').querySelector('input').value,'day-0');
  assert.equal(ui.stored.size,0);
});
