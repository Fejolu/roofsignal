import test from 'node:test';
import assert from 'node:assert/strict';
import {consumerAdminKeys,isConsumerAdmin} from '../supabase/functions/_shared/consumer-admin.mjs';
test('Private test access accepts only the actual environment secret or legacy bearer',()=>{
 const keys=consumerAdminKeys('legacy-test-value',JSON.stringify({default:'sb_secret_test-value'}));
 assert.equal(isConsumerAdmin(new Headers({apikey:'sb_secret_test-value'}),keys),true);
 assert.equal(isConsumerAdmin(new Headers({authorization:'Bearer legacy-test-value'}),keys),true);
 for(const headers of [{},{apikey:'sb_publishable_test-value'},{apikey:'sb_secret_other'},{authorization:'Bearer sb_secret_test-value'}])assert.equal(isConsumerAdmin(new Headers(headers),keys),false);
});
test('Missing, malformed and publishable-key configuration cannot open private test access',()=>{
 for(const encoded of ['', 'invalid', 'null', JSON.stringify({default:'sb_publishable_test-value'})]) {
  const keys=consumerAdminKeys('',encoded);
  assert.equal(isConsumerAdmin(new Headers(),keys),false);
  assert.equal(isConsumerAdmin(new Headers({apikey:'sb_publishable_test-value'}),keys),false);
 }
});
