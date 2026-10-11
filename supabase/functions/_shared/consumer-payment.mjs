// Payment invariants shared by the Edge Function and fault-injection tests.
export const PROFILE_ID = 'pfl_Bef5DYX9w5';
export const RETRY_WINDOW_MS = 40 * 60 * 1000;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const TERMINAL = new Set(['confirmed','paid_review_required','failed','canceled','expired','not_created']);
export function euro(cents) {
  if (!Number.isSafeInteger(cents) || cents < 1) throw Error('INVALID_AMOUNT');
  return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
}
export function paymentBody(attempt, quote, publicBase) {
  if (!UUID.test(attempt.id) || quote.id !== attempt.quote_id || !['test','live'].includes(attempt.mode)) throw Error('INVALID_ATTEMPT');
  return {
    amount:{currency:'EUR',value:euro(quote.total_cents)},
    description:`RoofSignal Inspectie ${attempt.reference}`,
    profileId:PROFILE_ID, testmode:attempt.mode==='test', method:'ideal', locale:'nl_NL',
    redirectUrl:`https://www.roofsignal.nl/inspectie-boeken/?booking=${attempt.status_token}`,
    webhookUrl:`${publicBase}/webhook?mode=${attempt.mode}`,
    metadata:{consumerRequestId:attempt.id,quoteId:quote.id,integration:'roofsignal-consumer-v1',mode:attempt.mode}
  };
}
export function verifyPayment(payment,attempt,quote) {
  if (!payment || !/^tr_[A-Za-z0-9]+$/.test(payment.id||'') || (attempt.payment_id && payment.id!==attempt.payment_id)
    || payment.mode!==attempt.mode || payment.profileId!==PROFILE_ID
    || payment.amount?.currency!=='EUR' || payment.amount?.value!==euro(quote.total_cents)
    || payment.metadata?.consumerRequestId!==attempt.id || payment.metadata?.quoteId!==quote.id
    || payment.metadata?.integration!=='roofsignal-consumer-v1' || payment.metadata?.mode!==attempt.mode
    || !['open','pending','authorized','paid','failed','canceled','expired'].includes(payment.status)) throw Error('PAYMENT_MISMATCH');
  return payment;
}
export function checkoutHref(payment) {
  const url=new URL(payment?._links?.checkout?.href);
  if(url.protocol!=='https:'||!['www.mollie.com','checkout.mollie.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('INVALID_CHECKOUT_URL');
  return url.href;
}
export function mayRetryCreation(attempt,keyFingerprint,now=Date.now()) {
  return !attempt.payment_id && attempt.key_fingerprint===keyFingerprint
    && Number.isFinite(Date.parse(attempt.payment_started_at))
    && now-Date.parse(attempt.payment_started_at)>=0
    && now-Date.parse(attempt.payment_started_at)<RETRY_WINDOW_MS;
}
export function customerInput(body) {
  const c=body?.customer||{},t=body?.terms||{};
  const clean=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():'';
  const result={name:clean(c.name,160),email:clean(c.email,254).toLowerCase(),phone:clean(c.phone,30),notes:clean(c.notes,2000)};
  if(!result.name||/[\r\n]/.test(result.name)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||!result.phone
    ||t.accepted!==true||typeof t.earlyStartRequested!=='boolean')throw Error('INVALID_REQUEST');
  return result;
}
export async function reconcilePayment({attempt,quote,payment,calendar,save}) {
  verifyPayment(payment,attempt,quote);
  if(attempt.status==='confirmed') {
    if(payment.status!=='paid')throw Error('PAYMENT_STATUS_CONFLICT');
    return attempt;
  }
  if(payment.status==='paid') {
    // Persist the verified money receipt before touching the calendar.
    attempt=await save({payment_id:payment.id,payment_status:'paid',status:'paid_review_required',checkout_url:null});
    try {
      await calendar('confirm',{requestId:attempt.id,start:attempt.slot_start,destination:quote.destination,reference:attempt.reference});
    } catch { return attempt; }
    return await save({status:'confirmed'});
  }
  if(attempt.payment_status==='paid')throw Error('PAYMENT_STATUS_CONFLICT');
  if(['failed','canceled','expired'].includes(payment.status)) {
    // Capacity is only released after the provider proves payment cannot occur
    // AND our exact calendar hold has been removed. A network timeout is pending.
    await calendar('release',{requestId:attempt.id,start:attempt.slot_start});
    return await save({payment_id:payment.id,payment_status:payment.status,status:payment.status,checkout_url:null});
  }
  // Always derive the resumable checkout from the verified current provider
  // response. An earlier interrupted/pending creation may not have saved it.
  return await save({payment_id:payment.id,payment_status:payment.status,status:'payment_pending',
    checkout_url:payment.status==='open'?checkoutHref(payment):null});
}
