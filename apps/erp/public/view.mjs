export const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const date = value=>value?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(value.length===10?value+'T12:00:00Z':value)):'Nog te bepalen';
export const labels={private:'Particulier',vve:'VvE',business:'Zakelijk',manager:'Vastgoedbeheerder',inspection:'Gebouwschilinspectie',thermal:'Thermografie',inspection_thermal:'Inspectie + thermografie',construction:'Bouwvoortgang',photogrammetry:'Fotogrammetrie',draft:'Concept',active:'In uitvoering',completed:'Afgerond',cancelled:'Geannuleerd',published:'Vrijgegeven',withdrawn:'Ingetrokken',open:'Nieuw',in_progress:'In behandeling',closed:'Afgehandeld',proposed:'Datumvoorstel',low:'Lage prioriteit',medium:'Aandacht nodig',high:'Hoge prioriteit',observed:'Vastgesteld',unchanged:'Ongewijzigd',worse:'Verslechterd',improved:'Verbeterd',not_visible:'Niet zichtbaar',move:'Afspraak wijzigen',repair:'Herstel melden',question:'Vraag stellen',correction:'Objectgegevens corrigeren'};
export const label=value=>labels[value]||value||'—';
export const badge=value=>`<span class="tag ${['published','completed','closed','improved'].includes(value)?'green':['medium','open','active','proposed','draft'].includes(value)?'orange':['high','worse','withdrawn'].includes(value)?'red':''}">${esc(label(value))}</span>`;
export const callPhoneFromHash=hash=>{
  if(!/^#call(?:\/|$)/.test(hash))throw new Error('Geen oproep geselecteerd.');
  let phone;try{phone=decodeURIComponent(hash.slice(6));}catch{throw new Error('Het telefoonnummer in de oproep is niet geldig.');}
  if(phone.length>200)throw new Error('Het telefoonnummer in de oproep is niet geldig.');
  return phone;
};
// Only a successful, consistent lookup may open a customer or a new customer form.
export const callDestination=result=>{
  if(!result||!Array.isArray(result.customers))throw new Error('Het telefoonnummer kon niet worden gecontroleerd.');
  const people=result.customers,phone=result.phone;
  if(result.match==='withheld'&&phone===null&&people.length===0)return {kind:'withheld'};
  if(typeof phone!=='string'||!/^\+[1-9]\d{6,14}$/.test(phone))throw new Error('Het telefoonnummer kon niet worden gecontroleerd.');
  if(result.match==='none'&&people.length===0)return {kind:'new',phone};
  if(!people.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'))throw new Error('Het telefoonnummer kon niet worden gecontroleerd.');
  if(result.match==='single'&&people.length===1)return {kind:'customer',id:people[0].id};
  if(result.match==='multiple'&&people.length>1)return {kind:'choose',customers:people};
  throw new Error('Het telefoonnummer kon niet worden gecontroleerd.');
};
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',incoming:'<path d="M4 4h16v13l-4 4H4V4ZM8 8h8M8 12h8m-4 5h8"/>',telephony:'<path d="M7 3H3v4a14 14 0 0 0 14 14h4v-4l-5-2-2 2a10 10 0 0 1-7-7l2-2-2-5Z"/>',customers:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',objects:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',orders:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 5V3h6v2M8 10h8M8 14h8M8 18h4"/>',reports:'<path d="M14 3H5v18h14V8l-5-5v5h5M8 12h8M8 16h8"/>',requests:'<path d="M21 4H3v13h5v4l5-4h8V4ZM7 8h10M7 12h6"/>',visits:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'})[name]||''}</svg>`;
export const empty=(title,description='')=>`<div class="empty"><strong>${esc(title)}</strong>${esc(description)}</div>`;
export const button=(text,action,id='',secondary=false)=>`<button class="btn ${secondary?'secondary':''}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(text)}</button>`;
export const field=(name,title,type='text',value='',required=true)=>`<label>${esc(title)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="${type==='email'?254:200}"></label>`;
export const area=(name,title,value='',required=true)=>`<label>${esc(title)}<textarea name="${esc(name)}" ${required?'required':''} maxlength="5000">${esc(value)}</textarea></label>`;
export const select=(name,title,options,value='')=>`<label>${esc(title)}<select name="${esc(name)}" required>${options.map(([id,text])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;

export const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value/100):'Niet vastgelegd';
export const dateTime=value=>value?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(value)):'Nog te bepalen';
export const intakeSource=value=>({consumer:'Consumentenboeking',parken:'De Parken',vve:'VvE-aanvraag'})[value]||'Website';
export const intakeState=value=>({paid_confirmed:'Betaald · bevestigd',paid_review:'Betaald · afstemming nodig',awaiting_payment:'Nog niet betaald',payment_cancelled:'Betaling afgebroken',payment_failed:'Betaling mislukt',payment_expired:'Betaaltermijn verlopen',payment_not_created:'Boeking niet afgerond',creation_review:'Betaalopdracht controleren',pilot_pending:'Bevestiging in behandeling',pilot_confirmed:'Afspraak bevestigd',pilot_completed:'Inspectie afgerond',pilot_cancelled:'Afspraak geannuleerd',pilot_declined:'Afspraak afgewezen',inquiry:'Nieuwe aanvraag'})[value]||'Controle nodig';
