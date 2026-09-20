import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryPayload,sendDelivery,internalTestBooking,INTERNAL_EMAIL,ODOO_EMAIL} from '../supabase/functions/_shared/parken-delivery.mjs';

const job={id:'30f2c9e5-3978-43bd-903a-a24c5e9ba53d',reference:'RS-PARKEN-1234ABCD',is_test:false,
  booking_snapshot:{...internalTestBooking(),reference:'RS-PARKEN-1234ABCD',email:'customer@example.test'}};
const sender={email:'noreply@roofsignal.nl',name:'RoofSignal'};

test('each registration goes only to Ferry and the fixed Odoo alias, with client reply-to',()=>{
  const p=deliveryPayload({...job,to:'attacker@example.test',booking_snapshot:{...job.booking_snapshot,to:'attacker@example.test'}},sender);
  assert.deepEqual(p.to.map(r=>r.email),[INTERNAL_EMAIL,ODOO_EMAIL]);
  assert.equal(p.replyTo.email,'customer@example.test');
  assert.equal(p.headers.idempotencyKey,job.id);
  for(const value of ['customer@example.test','16:00-18:00','€ 664,29','€ 302,50','Referentie','Bijzonderheden'])assert.ok(p.textContent.includes(value),value);
});

test('stored base-only price and both thermal states are preserved',()=>{
  const p=deliveryPayload({...job,booking_snapshot:{...job.booking_snapshot,thermography_selected:false,thermography_excl_cents:0,total_incl_cents:36179}},sender);
  assert.match(p.textContent,/Geen thermografische inspectie bijgeboekt/);
  assert.ok(p.textContent.includes('361,79'));
  assert.throws(()=>deliveryPayload({...job,booking_snapshot:{...job.booking_snapshot,total_incl_cents:1}},sender),/INVALID_ORDER_SNAPSHOT/);
});

test('customer-entered HTML and subject newlines cannot alter message layout or headers',()=>{
  const p=deliveryPayload({...job,booking_snapshot:{...job.booking_snapshot,name:'<img src=x onerror=alert(1)>',street:'Straat\r\nBcc: evil',notes:'<script>bad()</script>'}},sender);
  assert.ok(!p.htmlContent.includes('<script>'));
  assert.ok(!p.htmlContent.includes('<img src=x'));
  assert.ok(p.htmlContent.includes('&lt;script&gt;'));
  assert.doesNotMatch(p.subject,/[\r\n]/);
  assert.deepEqual(p.to.map(r=>r.email),[INTERNAL_EMAIL,ODOO_EMAIL]);
});

test('accepted sends and duplicate idempotency responses do not become new messages',async()=>{
  const p=deliveryPayload(job,sender);
  let calls=0;
  const fetcher=async(url,request)=>{
    calls++;
    assert.equal(url,'https://api.brevo.com/v3/smtp/email');
    assert.deepEqual(JSON.parse(request.body),p);
    return calls===1 ? new Response(JSON.stringify({messageId:'<test@brevo>'}),{status:201})
      : new Response(JSON.stringify({code:'duplicate_parameter',message:'Email for the idempotency key has already been processed'}),{status:400});
  };
  assert.deepEqual(await sendDelivery(p,'test-key',fetcher),{messageId:'<test@brevo>'});
  assert.equal((await sendDelivery(p,'test-key',fetcher)).alreadyAccepted,true);
});

test('provider failures remain failures and do not expose provider bodies',async()=>{
  for(const response of [new Response(JSON.stringify({code:'duplicate_parameter',message:'Duplicate recipient'}),{status:400}),new Response('secret customer text',{status:503})]){
    await assert.rejects(sendDelivery({},'test-key',async()=>response),/^Error: BREVO_HTTP_/);
  }
  await assert.rejects(sendDelivery({},'',()=>{throw Error('must not send')}),/NOT_CONFIGURED/);
});

test('test payload is explicitly marked and reuses the same rendering and destinations',()=>{
  const b=internalTestBooking();const p=deliveryPayload({...job,reference:b.reference,is_test:true,booking_snapshot:b},sender);
  assert.match(p.subject,/^\[TEST - NIET UITVOEREN\]/);
  assert.match(p.textContent,/reserveert geen plek/);
  assert.deepEqual(p.to.map(r=>r.email),[INTERNAL_EMAIL,ODOO_EMAIL]);
});
