import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase,seedDemo,command,write,USERS} from '../src/database.mjs';
async function fixture(t){const db=await openDatabase();t.after(()=>db.close());await seedDemo(db);const s=await command(db,USERS.customer,'snapshot');return {db,p:s.properties[0]};}
const input=p=>({organization_id:p.organization_id,property_id:p.id,kind:'quote',title:'Dakinspectie',description:'Dak en gevel, inclusief rapport.',amount_excl_cents:29900,vat_percent:21,valid_until:'2099-12-31'});
test('commercial amounts are calculated on server; repeat creates one immutable document',async t=>{
 const {db,p}=await fixture(t),payload={...input(p),request_id:randomUUID()};
 const a=await command(db,USERS.staff,'commercial.create',payload);assert.deepEqual(await command(db,USERS.staff,'commercial.create',payload),a);
 const docs=(await command(db,USERS.staff,'snapshot')).commercial_documents;assert.equal(docs.length,1);assert.equal(docs[0].total_cents,36179);
 await assert.rejects(command(db,USERS.staff,'commercial.create',{...payload,title:'Changed'}),/Verzoeknummer/);
 await assert.rejects(write(db,USERS.staff,'commercial.create',{...input(p),total_cents:1}),/Ongeldige invoer/);
});
test('finance access is separate, scoped, revocable; drafts remain internal',async t=>{
 const {db,p}=await fixture(t),a=await write(db,USERS.staff,'commercial.create',input(p));
 assert.equal((await command(db,USERS.finance,'snapshot')).commercial_documents.length,0);
 await write(db,USERS.staff,'commercial.release',{id:a.id});
 assert.equal((await command(db,USERS.finance,'snapshot')).commercial_documents.length,1);
 assert.equal((await command(db,USERS.customer,'snapshot')).commercial_documents.length,0);
 assert.equal((await command(db,USERS.other,'snapshot')).commercial_documents.length,0);
 await assert.rejects(write(db,USERS.finance,'commercial.withdraw',{id:a.id}),/Geen toegang/);
 await db.query('update erp.access_grants set revoked_at=now() where user_id=$1',[USERS.finance]);
 assert.equal((await command(db,USERS.finance,'snapshot')).commercial_documents.length,0);
});
test('expired quotes cannot release; invoice drafts never become customer invoices',async t=>{
 const {db,p}=await fixture(t),q=await write(db,USERS.staff,'commercial.create',{...input(p),valid_until:'2000-01-01'});
 await assert.rejects(write(db,USERS.staff,'commercial.release',{id:q.id}),/geldige offertedatum/);
 const i=await write(db,USERS.staff,'commercial.create',{...input(p),kind:'invoice_draft'});
 await assert.rejects(write(db,USERS.staff,'commercial.release',{id:i.id}),/factuurconcept/);
 await assert.rejects(write(db,USERS.customer,'commercial.create',input(p)),/Geen toegang/);
 await assert.rejects(write(db,USERS.staff,'commercial.create',{...input(p),amount_excl_cents:'1.5'}),/Ongeldig bedrag/);
 const valid=await write(db,USERS.staff,'commercial.create',input(p));await write(db,USERS.staff,'commercial.release',{id:valid.id});await write(db,USERS.staff,'commercial.withdraw',{id:valid.id});
 assert.equal((await command(db,USERS.finance,'snapshot')).commercial_documents.length,0);
});
