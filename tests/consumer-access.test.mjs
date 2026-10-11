import test from 'node:test';
import assert from 'node:assert/strict';
import {consumerMode,verifiedChallenge,assertMode,publicError} from '../supabase/functions/_shared/consumer-access.mjs';
test('Anonymous mode selection cannot expose private tests or choose alternate credentials',()=>{
  for(const hint of [null,'test','live','admin','../secret'])assert.equal(consumerMode(false,hint),'live');
  assert.equal(consumerMode(true,null),'test');assert.equal(consumerMode(true,'live'),'live');
  assert.throws(()=>consumerMode(true,'other'),/INVALID_MODE/);
  assert.throws(()=>assertMode({mode:'test'},'live'),/INVALID_REQUEST/);
  assert.throws(()=>assertMode(null,'live'),/INVALID_REQUEST/);
});
test('A solved challenge from another site or form is not accepted',()=>{
  const valid={success:true,hostname:'www.roofsignal.nl',action:'consumer_quote'};
  assert.equal(verifiedChallenge(valid),true);
  for(const patch of [{success:false},{hostname:'evil.example'},{hostname:'www.roofsignal.nl.evil.example'},{action:'contact'},{action:undefined}])
    assert.equal(verifiedChallenge({...valid,...patch}),false);
});
test('Unexpected backend messages never leak appointment or credential details',()=>{
  assert.ok(!publicError('private location or secret').includes('private location'));
  assert.match(publicError('QUOTE_EXPIRED'),/verlopen/);
});
