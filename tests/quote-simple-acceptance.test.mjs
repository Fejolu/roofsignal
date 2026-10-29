import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceRecipientMatches, stampSimpleAcceptance } from '../supabase/functions/_shared/quote-simple-acceptance.mjs';
test('personal quote rejects another identity, including a changed name',()=>{
 const recipient={contact_name:'Test Ontvanger',contact_email:'test@example.invalid'};
 assert.equal(acceptanceRecipientMatches('Test Ontvanger','TEST@example.invalid',recipient),true);
 assert.equal(acceptanceRecipientMatches('Andere naam','test@example.invalid',recipient),false);
 assert.equal(acceptanceRecipientMatches('Test Ontvanger','ander@example.invalid',recipient),false);
});
test('stamp targets only last page, preserves pages and uses Amsterdam server time',async()=>{
 const calls=[]; const pages=[{drawText(){throw Error('first page modified')}},{drawText:(text,options)=>calls.push({text,options})}];
 const pdf={getPageCount:()=>2,getPages:()=>pages,embedFont:async()=>({}),save:async()=>new Uint8Array([1,2])};
 const lib={PDFDocument:{load:async()=>pdf},StandardFonts:{Helvetica:'Helvetica'},rgb:(...v)=>v};
 await stampSimpleAcceptance(new Uint8Array(),{actorName:'Test Ontvanger',actorEmail:'test@example.invalid',acceptedAt:new Date('2026-10-29T12:34:56Z')},lib);
 assert.equal(calls.length,2); assert.match(calls[1].text,/13:34:56/);assert.match(calls[1].text,/29 oktober 2026/);
 assert.ok(calls.every(x=>x.options.y<100));
});
