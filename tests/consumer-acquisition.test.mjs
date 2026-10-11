import test from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionCampaign} from '../supabase/functions/_shared/consumer-acquisition.mjs';
test('booking attribution rejects arbitrary strings, identities and structured input', () => {
 for(const value of [null,undefined,'',123,{},['search_consument_apeldoorn'],'secret@example.com','search_consument_apeldoorn?email=secret']) assert.equal(acquisitionCampaign(value),null);
 for(const value of ['search_consument_apeldoorn','google_bedrijfsprofiel','parken_flyer']) assert.equal(acquisitionCampaign(value),value);
});
