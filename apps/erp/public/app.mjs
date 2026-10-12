import {esc,date,label,badge,icon,empty,button,field,area,select,callPhoneFromHash,callDestination,money,dateTime,intakeSource,intakeState} from './view.mjs';
const app=document.querySelector('#app'),dialog=document.querySelector('#dialog'),account=document.querySelector('#account');
let data=null,query='',toastTimer,loadVersion=0,phoneLookupVersion=0,handledCallRoute=null,pendingCallRoute=null;
let config=null,authView='login',authBusy=false,authVersion=0,recoverySession=false,accessData=null,accessVersion=0,accessLoading=false,accessError='',incomingData=null,incomingLoading=false,incomingError='',incomingVersion=0;
let callView={status:'idle',phone:'',result:null,error:''};
function cancelPhoneLookup(){++phoneLookupVersion;if(callView.status==='loading')callView={status:'idle',phone:'',result:null,error:''};}
const byId=(list,id)=>list.find(x=>x.id===id);
const orgName=id=>byId(data.organizations,id)?.name||'Dossier';
const property=id=>byId(data.properties,id);
const propertyName=id=>property(id)?.name||'Object';
const inspection=id=>byId(data.inspections,id);
const reportFor=id=>data.reports.find(r=>r.inspection_id===id);
const objectLink=p=>`#object/${p.id}/${p.organization_id}`;
const matches=item=>!query||Object.values(item).some(v=>typeof v==='string'&&v.toLocaleLowerCase('nl').includes(query));
const panel=(title,body,link='')=>`<section class="panel"><div class="panelhead"><h2>${title}</h2>${link}</div>${body}</section>`;
const head=(eyebrow,title,subtitle='',actions='')=>`<header class="pagehead"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="buttons">${actions}</div></header>`;
const row=(title,detail,right='',href='')=>`<div class="row"><div class="row-main"><strong>${href?`<a href="${esc(href)}">${esc(title)}</a>`:esc(title)}</strong><p>${esc(detail)}</p></div><div class="row-right">${right}</div></div>`;

function clearWorkspace() {
  ++authVersion;++loadVersion;++accessVersion;++incomingVersion;incomingData=null;incomingLoading=false;incomingError='';authBusy=false;cancelPhoneLookup();callView={status:'idle',phone:'',result:null,error:''};data=null;accessData=null;accessLoading=false;accessError='';query='';handledCallRoute=null;pendingCallRoute=null;
  if(dialog.open)dialog.close();dialog.innerHTML='';account.value='';clearTimeout(toastTimer);
  const t=document.querySelector('#toast');t.hidden=true;t.textContent='';
}
function sessionEnded() {
  clearWorkspace();recoverySession=false;authView='login';welcome();
}
async function request(url,options={}) {
  const generation=authVersion;
  const response=await fetch(url,{credentials:'same-origin',...options});
  const body=await response.json();
  if(!response.ok){
    if(generation===authVersion&&response.status===401&&(url==='/api/command'||url.startsWith('/api/reports/')))sessionEnded();
    throw Object.assign(new Error(body.error||'Er ging iets mis.'),{status:response.status,recoveryRequired:body.recovery_required===true});
  }
  return body;
}
const rpc=(action,payload={})=>request('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});
function toast(message) {const t=document.querySelector('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,5500);}
function authShell(content) {
  return `<main class="welcome auth-welcome"><div class="wordmark">ROOF<span>SIGNAL</span></div>${config?.environment==='test'?'<span class="auth-environment">Testomgeving</span>':''}${content}</main>`;
}
function authForm(kind) {
  const error='<p class="form-error" role="alert" hidden></p>';
  if(kind==='forgot')return authShell(`<h1>Wachtwoord vergeten?</h1><p>Ontvang een link om een nieuw wachtwoord in te stellen.</p><form class="auth-form" data-auth="reset-request"><label>E-mailadres<input name="email" type="email" autocomplete="email" required maxlength="254"></label>${error}<button class="btn" ${authBusy?'disabled':''}>${authBusy?'Versturen…':'Verstuur herstellink'}</button></form><button class="text-button" data-action="auth.login">Terug naar inloggen</button>`);
  if(kind==='reset'&&recoverySession)return authShell(`<h1>Nieuw wachtwoord</h1><p>Minimaal 12 tekens, met een hoofdletter, kleine letter en cijfer.</p><form class="auth-form" data-auth="password"><label>Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="256"></label><label>Herhaal wachtwoord<input name="repeat" type="password" autocomplete="new-password" required minlength="12" maxlength="256"></label>${error}<button class="btn" ${authBusy?'disabled':''}>${authBusy?'Opslaan…':'Wachtwoord opslaan'}</button></form>`);
  if(kind==='reset-sent')return authShell('<h1>Controleer uw e-mail</h1><p>Als er een account voor dit e-mailadres bestaat, ontvangt u een herstellink.</p><button class="btn" data-action="auth.login">Terug naar inloggen</button>');
  return authShell(`<h1>Inloggen</h1><p>Uw RoofSignal-werkruimte en vastgoeddossier.</p><form class="auth-form" data-auth="login"><label>E-mailadres<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>${error}<button class="btn" ${authBusy?'disabled':''}>${authBusy?'Inloggen…':'Inloggen'}</button></form>${config?.passwordRecovery?'<button class="text-button" data-action="auth.forgot">Wachtwoord vergeten?</button>':''}`);
}
function welcome() {
  if(config?.mode==='hosted'){app.innerHTML=authForm(authView);return;}
  if(config?.mode!=='demo'){app.innerHTML=authShell('<h1>Werkruimte niet beschikbaar</h1><p>De verbinding kon niet worden geopend.</p><button class="btn" data-action="bootstrap">Opnieuw proberen</button>');return;}
  app.innerHTML=`<main class="welcome"><div class="wordmark">ROOF<span>SIGNAL</span></div><div class="eyebrow">Eigen ERP & klantportaal</div><h1>Eén dossier.<br>Iedereen het juiste overzicht.</h1><p>Verken de werkruimte met fictieve gegevens. Wat je hier opslaat, blijft in deze lokale proefomgeving bewaard.</p><div class="login-options"><button class="btn" data-account="staff"><span>Open de backoffice<small>Klanten, objecten, opdrachten en rapportvrijgave</small></span>→</button><button class="btn secondary" data-account="customer"><span>Open het klantportaal<small>Eigen object, rapport, datumvoorstel en verzoeken</small></span>→</button></div></main>`;
}
async function bootstrap() {
  clearWorkspace();config=null;recoverySession=false;authView='login';account.disabled=true;
  const bar=document.querySelector('.devbar');if(bar)bar.hidden=true;
  const version=authVersion;app.innerHTML=authShell('<p>Werkruimte openen…</p>');
  try {
    const next=await request('/api/config');if(version!==authVersion)return;
    if(!['hosted','demo'].includes(next.mode))throw new Error('Ongeldige werkruimte.');
    config=next;if(bar)bar.hidden=config.mode!=='demo';account.disabled=config.mode!=='demo';
    const session=await request('/api/session');if(version!==authVersion)return;
    recoverySession=config.mode==='hosted'&&session.recovery===true;
    if(recoverySession){authView='reset';location.hash='reset';welcome();}
    else if(session.authenticated===true)await load();
    else welcome();
  }catch(e){if(version!==authVersion)return;clearWorkspace();config=null;welcome();}
}
async function load() {
  const version=++loadVersion,generation=authVersion;
  try {const next=await rpc('snapshot');if(version!==loadVersion||generation!==authVersion)return;data=next;if(config?.mode==='demo'&&data.dev_account)account.value=data.dev_account;render();}
  catch(e){if(version!==loadVersion||generation!==authVersion)return;data=null;if(e.status===401)welcome();else app.innerHTML=`<main class="welcome error-banner"><h1>Werkruimte niet beschikbaar</h1><p>${esc(e.message)}</p>${button('Opnieuw proberen','reload')}</main>`;}
}
async function login(value) {
  if(config?.mode!=='demo'||!value)return;
  const pendingCall=value==='staff'?(pendingCallRoute||(/^#call(?:\/|$)/.test(location.hash)?location.hash:null)):null;
  clearWorkspace();const generation=authVersion;account.disabled=true;app.innerHTML='<div class="welcome">Proefaccount openen…</div>';
  try {await request('/api/dev-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:value})});if(generation!==authVersion)return;account.value=value;location.hash=pendingCall||'overview';await load();}
  catch(e){if(generation===authVersion){welcome();toast(e.message);}}
  finally{if(generation===authVersion)account.disabled=false;}
}
async function submitAuth(form) {
  if(config?.mode!=='hosted'||authBusy)return;
  const kind=form.dataset.auth,values=Object.fromEntries(new FormData(form));
  if(kind==='password'&&(!recoverySession||values.password!==values.repeat)){const el=form.querySelector('.form-error');el.textContent='De wachtwoorden moeten hetzelfde zijn.';el.hidden=false;return;}
  if(kind==='password'&&(values.password.length<12||!/[a-z]/.test(values.password)||!/[A-Z]/.test(values.password)||!/[0-9]/.test(values.password))){const el=form.querySelector('.form-error');el.textContent='Gebruik minimaal 12 tekens, met een hoofdletter, kleine letter en cijfer.';el.hidden=false;return;}
  const pendingCall=kind==='login'&&/^#call(?:\/|$)/.test(location.hash)?location.hash:null;
  clearWorkspace();authBusy=true;const generation=authVersion;welcome();
  const endpoint={login:'/api/login','reset-request':'/api/reset-request',password:'/api/password'}[kind];
  try {
    if(!endpoint)throw new Error('Deze actie is niet beschikbaar.');
    await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(kind==='reset-request'?{email:values.email}:kind==='password'?{password:values.password}:{email:values.email,password:values.password})});
    if(generation!==authVersion)return;
    if(kind==='login'){recoverySession=false;location.hash=pendingCall||'overview';await load();}
    else {recoverySession=false;authView=kind==='reset-request'?'reset-sent':'login';location.hash='';welcome();if(kind==='password')toast('Uw wachtwoord is opgeslagen. Log opnieuw in.');}
  }catch(e){if(generation!==authVersion)return;if(kind==='password'&&(e.recoveryRequired||e.status===401)){recoverySession=false;authView='forgot';}welcome();const el=app.querySelector?.('.form-error');if(el){el.textContent=e.message;el.hidden=false;}else toast(e.message);}
  finally{if(generation===authVersion){authBusy=false;const submit=app.querySelector?.('.auth-form button');if(submit){submit.disabled=false;submit.textContent=kind==='login'?'Inloggen':kind==='password'?'Wachtwoord opslaan':'Verstuur herstellink';}}}
}
function canManageAccess(){return data?.staff===true&&data.staff_role==='administrator'&&data.permissions?.manage_access===true;}
function navigation(active) {
  const tabs=data.staff?[['overview','Overzicht'],['customers','Klanten'],['incoming','Websiteboekingen'],['telephony','Telefonie'],['objects','Objecten'],['orders','Opdrachten'],['reports','Rapporten'],['requests','Verzoeken'],...(canManageAccess()?[['access','Toegang']]:[])]:[['overview','Mijn overzicht'],['objects','Mijn objecten'],['reports','Rapporten'],['visits','Afspraken'],['requests','Mijn verzoeken'],['profile','Mijn gegevens']];
  const selected={customer:'customers',call:'telephony',object:'objects',order:'orders',report:'reports'}[active]||active;
  return tabs.map(([key,title])=>`<a href="#${key}" class="${selected===key?'active':''}" ${selected===key?'aria-current="page"':''}>${icon(key)}${title}</a>`).join('');
}
function overview() {
  if(!data.staff&&!data.properties.length)return head('Uw RoofSignal-account','Nog geen dossiers toegewezen','Uw dossier verschijnt hier zodra RoofSignal toegang heeft toegekend.')+panel('Mijn gegevens',`<div class="panelbody"><p>U kunt uw contactgegevens alvast controleren.</p><a class="btn secondary" href="#profile">Mijn gegevens</a></div>`);
  const openOrders=data.orders.filter(o=>o.status==='active');
  const drafts=data.reports.filter(r=>r.status==='draft');
  const published=data.reports.filter(r=>r.status==='published');
  const requests=data.requests.filter(r=>r.status!=='closed');
  const metrics=data.staff?[[new Set(data.properties.map(p=>p.id)).size,'Objecten in beheer','Doorlopende vastgoeddossiers'],[openOrders.length,'Actieve opdrachten','Voorbereiding en uitvoering'],[drafts.length,'Rapporten in concept','Nog niet zichtbaar voor klanten'],[requests.length,'Open verzoeken','Vragen en klantmeldingen']]:[[new Set(data.properties.map(p=>p.id)).size,'Mijn objecten','Uw vastgoeddossiers'],[published.length,'Vrijgegeven rapporten','Direct te bekijken'],[data.visits.filter(v=>v.status==='proposed').length,'Datumvoorstellen','Nog af te stemmen'],[requests.length,'Open verzoeken','Door RoofSignal op te volgen']];
  const work=data.staff?openOrders.map(o=>row(o.title,`${propertyName(o.property_id)} · ${orgName(o.organization_id)}`,badge(o.status),`#order/${o.id}`)).join(''):data.properties.map(p=>row(p.name,`${p.address}, ${p.city}`,`<a href="${objectLink(p)}">Open dossier →</a>`,objectLink(p))).join('');
  return head(data.staff?'RoofSignal werkruimte':'Uw vastgoeddossier',data.staff?'Vandaag in beeld.':'Welkom in uw dossier.',data.staff?'Van eerste opdracht tot een zorgvuldig vrijgegeven rapport.':'Bekijk uw objecten, rapporten en de volgende inspectieronde.',data.staff?button('Nieuwe opdracht','order.new'):'')+
    `<div class="metrics">${metrics.map(([n,t,s])=>`<article class="metric"><span class="label">${t}</span><strong>${n}</strong><small>${s}</small></article>`).join('')}</div><div class="columns"><div>${panel(data.staff?'Aan het werk':'Mijn objecten',work||empty('Nog geen actieve dossiers'),`<a href="#${data.staff?'orders':'objects'}">Alles bekijken →</a>`)}${panel('Laatste rapporten',reportRows(data.staff?data.reports.slice(0,3):published.slice(0,3)),`<a href="#reports">Alle rapporten →</a>`)}</div><div>${panel('Volgende inspectieronde',visitRows(data.visits.filter(v=>v.status==='proposed').slice(0,3)))}${panel(data.staff?'Verzoeken om op te pakken':'Uw laatste verzoeken',requestRows(data.requests.slice(0,3)),`<a href="#requests">Bekijken →</a>`)}</div></div>`;
}
function customers() {
  if(!data.staff)return denied();
  return head('Relaties','Klanten','Opdrachtgevers en contactgegevens.',button('Klant toevoegen','organization.new'))+panel(`Alle klanten <span class="count">${data.organizations.length}</span>`,data.organizations.filter(matches).map(o=>row(o.name,`${label(o.kind)}${o.contact_name?' · '+o.contact_name:''}${o.email?' · '+o.email:''}`,button('Object toevoegen','property.new',o.id,true),`#customer/${o.id}`)).join('')||empty('Geen klanten gevonden'));
}
function customerPage(id) {
  if(!data.staff)return denied();const o=byId(data.organizations,id);if(!o)return denied();
  const objects=data.properties.filter(p=>p.organization_id===id),orders=data.orders.filter(p=>p.organization_id===id);
  return `<a class="back" href="#customers">← Terug naar klanten</a>`+head(label(o.kind),o.name,o.contact_name||'Klantdossier',button('Object toevoegen','property.new',id))+
    `<div class="columns"><div>${panel('Objecten',objects.map(p=>row(p.name,`${p.address}, ${p.city}`,'',objectLink(p))).join('')||empty('Nog geen objecten','Voeg een object toe voor een eerste inspectieopdracht.'))}${panel('Opdrachten',orders.map(p=>row(p.title,label(p.service),badge(p.status),`#order/${p.id}`)).join('')||empty('Nog geen opdrachten'))}</div><div>${panel('Contactgegevens',`<dl class="facts customer-facts"><div><dt>Contactpersoon</dt><dd>${esc(o.contact_name||'Nog niet ingevuld')}</dd></div><div><dt>Telefoonnummer</dt><dd>${o.phone?`<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>`:'Nog niet ingevuld'}</dd></div><div><dt>E-mailadres</dt><dd>${o.email?`<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`:'Nog niet ingevuld'}</dd></div></dl>`)}</div></div>`;
}
function telephonyPage() {
  if(!data.staff)return denied();
  const {status,phone,result,error}=callView;
  let content=status==='paused'?`<p class="call-status">Er staat een oproep klaar. Rond uw formulier af of open de beller.</p>${button('Open beller','call.open')}`:status==='loading'?'<p class="call-status" role="status">Klant zoeken…</p>':status==='error'?`<p class="form-error" role="alert">${esc(error)}</p>`:status==='withheld'?'<p class="call-status">Dit nummer is afgeschermd. Vraag de beller naar zijn naam of klantgegevens.</p>':status==='new'?`<p class="call-status">${esc(result.phone)} is nog niet bekend.</p>${button('Nieuwe klantkaart openen','organization.new',result.phone)}`:status==='choose'?`<p>Dit telefoonnummer hoort bij meerdere klanten. Kies het juiste dossier.</p>${result.customers.map(o=>row(o.name,`${label(o.kind)}${o.contact_name?' · '+o.contact_name:''}`,'',`#customer/${o.id}`)).join('')}`:status==='matched'?'<p class="call-status">Het klantdossier is gevonden.</p>':'<p class="call-status">Een bekende beller opent het klantdossier. Voor een onbekend nummer opent een nieuwe klantkaart.</p>';
  return head('Klantcontact','Telefonie','Open tijdens een gesprek direct het juiste dossier.')+`<div class="columns"><div>${panel('Nummer opzoeken',`<form class="form call-form" data-phone-lookup>${field('phone','Telefoonnummer','tel',phone,false)}<button class="btn" ${status==='loading'?'disabled':''}>Klant zoeken</button></form><div class="call-result" aria-live="polite">${content}</div>`)}</div><div>${panel('Voys',`<div class="panelbody"><span class="tag orange">Nog niet verbonden</span><p class="hint">${config?.mode==='demo'?'U bekijkt een lokale proef met fictieve klanten. ':''}De Voys-koppeling is nog niet actief.</p></div>`)}</div></div>`;
}
async function lookupPhone(phone,route=location.hash) {
  if(!data?.staff)return;const version=++phoneLookupVersion;
  callView={status:'loading',phone,result:null,error:''};render();
  try {
    const result=await rpc('phone.lookup',{phone});
    if(version!==phoneLookupVersion||location.hash!==route||!data?.staff||dialog.open)return;
    const destination=callDestination(result);
    callView={status:destination.kind==='customer'?'matched':destination.kind,phone:result.phone||'',result,error:''};
    if(destination.kind==='customer'){location.hash=`customer/${destination.id}`;render();}
    else {render();if(destination.kind==='new')newCustomer(destination.phone,true);}
  }catch(e){if(version!==phoneLookupVersion||location.hash!==route||!data?.staff||dialog.open)return;callView={status:'error',phone,result:null,error:'Klant zoeken lukt nu niet. Controleer het nummer en probeer het opnieuw.'};render();}
}
function holdIncomingCall(){
  pendingCallRoute=location.hash;handledCallRoute=location.hash;callView={status:'paused',phone:'',result:null,error:''};
  if(dialog.open&&!dialog.querySelector('.pending-call'))dialog.insertAdjacentHTML('afterbegin',`<div class="pending-call" role="status"><p>Een oproep staat klaar. Uw formulier blijft open totdat u kiest.</p><div class="buttons">${button('Open beller','call.open')}${button('Later','call.ignore','',true)}</div></div>`);
}
function startCallRoute() {
  if(!data?.staff||handledCallRoute===location.hash)return;
  if(dialog.open){holdIncomingCall();return;}
  if(pendingCallRoute===location.hash){callView={status:'paused',phone:'',result:null,error:''};return;}
  handledCallRoute=location.hash;
  try {void lookupPhone(callPhoneFromHash(location.hash));}
  catch(e){callView={status:'error',phone:'',result:null,error:e.message};render();}
}
function objects() {
  return head('Doorlopende dossiers',data.staff?'Objecten':'Mijn objecten','Elke inspectie bouwt voort op hetzelfde objectdossier.',data.staff?button('Object toevoegen','property.new'):'')+`<div class="cards">${data.properties.filter(matches).map(p=>`<article class="card"><div class="property-icon">${icon('objects')}</div><small>${esc(orgName(p.organization_id))}</small><h2>${esc(p.name)}</h2><p>${esc(p.address)}<br>${esc(p.postcode)} ${esc(p.city)}</p><small>${data.inspections.filter(i=>i.property_id===p.id&&i.organization_id===p.organization_id).length} inspectieronden</small><div class="buttons"><a class="btn secondary" href="${objectLink(p)}">Open objectdossier →</a></div></article>`).join('')||empty('Nog geen objecten beschikbaar','RoofSignal koppelt uw objecten aan uw account.')}</div>`;
}
function observations(items) {
  return items.map(o=>`<article class="observation">${badge(o.severity)} <span class="tag">${esc(label(o.assessment))}</span><h3>${esc(o.title)}</h3><small>${esc(o.component)}</small><p>${esc(o.description)}</p><p class="advice"><b>Advies</b><br>${esc(o.recommendation)}</p></article>`).join('');
}
function objectPage(id,org) {
  const p=data.properties.find(p=>p.id===id&&p.organization_id===org);
  if(!p)return denied();
  const rounds=data.inspections.filter(i=>i.property_id===id&&i.organization_id===org);
  const orders=data.orders.filter(o=>o.property_id===id&&o.organization_id===org);
  return `<a class="back" href="#objects">← Terug naar objecten</a>`+head(orgName(org),p.name,`${p.address} · ${p.postcode} ${p.city}`,data.staff?button('Nieuwe opdracht','order.new',`${id}/${org}`):p.can_request?button('Verzoek indienen','request.new',`${id}/${org}`):'')+
    `<div class="columns"><div>${panel('Inspectiehistorie',rounds.length?`<div class="panelbody"><div class="timeline">${rounds.map(i=>{const r=reportFor(i.id);return `<article class="timeline-item"><small>${i.inspected_on?date(i.inspected_on):'Nog uit te voeren'}</small><h3>${esc(i.label)}</h3>${r?badge(r.status):'<span class="tag">Nog geen rapport</span>'}${observations(data.observations.filter(o=>o.inspection_id===i.id))}<div class="buttons">${r?`<a class="btn small secondary" href="#report/${r.id}">Bekijk rapport</a>`:''}${data.staff?`<a class="text-button" href="#order/${i.order_id}">Opdracht openen →</a>`:''}</div></article>`;}).join('')}</div></div>`:empty('Nog geen inspecties vastgelegd'))}</div><div>${panel('Objectgegevens',`<dl class="facts"><div><dt>Opdrachtgever</dt><dd>${esc(orgName(org))}</dd></div><div><dt>Locatie</dt><dd>${esc(p.city)}</dd></div><div><dt>Objectnummer</dt><dd>RS-${esc(id.slice(0,8).toUpperCase())}</dd></div></dl>`)}${panel('Opdrachten',orders.map(o=>row(o.title,label(o.service),badge(o.status),data.staff?`#order/${o.id}`:'')).join('')||empty('Geen opdrachten'))}${panel('Datumvoorstellen',visitRows(data.visits.filter(v=>v.property_id===id)))}</div></div>`;
}
function ordersPage() {
  if(!data.staff)return denied();
  return head('Van opdracht naar resultaat','Opdrachten','Scope, inspectieronden en rapportages per object.',button('Nieuwe opdracht','order.new'))+panel('Alle opdrachten',data.orders.filter(matches).map(o=>row(o.title,`${propertyName(o.property_id)} · ${label(o.service)}`,badge(o.status),`#order/${o.id}`)).join('')||empty('Nog geen opdrachten'));
}
function orderPage(id) {
  if(!data.staff)return denied();const o=byId(data.orders,id);if(!o)return denied();
  const rounds=data.inspections.filter(i=>i.order_id===id);
  return `<a class="back" href="#orders">← Terug naar opdrachten</a>`+head(propertyName(o.property_id),o.title,`${orgName(o.organization_id)} · ${label(o.service)}`,button('Status wijzigen','order.status',id,true)+button('Inspectieronde toevoegen','inspection.new',id))+
    panel('Opdrachtgegevens',`<div class="panelbody">${badge(o.status)}<p class="report-text">${esc(o.scope||'Nog geen scope vastgelegd.')}</p><small>Rapportdeadline: ${date(o.report_due_on)}</small>${o.internal_note?`<div class="hint"><b>Interne notitie</b><br>${esc(o.internal_note)}</div>`:''}</div>`)+
    (data.staff&&data.order_sources?.find(s=>s.order_id===id)?sourceOrderPanel(data.order_sources.find(s=>s.order_id===id)):'')+
    panel('Afspraak',appointmentRows((data.appointments||[]).filter(a=>a.order_id===id)))+
    rounds.map(i=>{const r=reportFor(i.id),locked=Boolean(r?.published_at);return panel(esc(i.label),`<div class="panelbody"><div class="report-footer"><span>Inspectiedatum: <b>${date(i.inspected_on)}</b></span>${!locked?button('Datum vastleggen','inspection.date',i.id,true):badge(r.status)}</div>${observations(data.observations.filter(o=>o.inspection_id===i.id))||'<p class="hint">Nog geen bevindingen vastgelegd.</p>'}<div class="buttons">${!locked?button('Bevinding toevoegen','observation.new',i.id)+button(r?'Rapportconcept bewerken':'Rapportconcept maken','report.new',i.id,true):''}${r?`<a class="btn secondary" href="#report/${r.id}">Rapport openen →</a>`:''}</div></div>`);}).join('');
}
function reportRows(reports) {return reports.map(r=>row(r.title,`${date(inspection(r.inspection_id)?.inspected_on)}${inspection(r.inspection_id)?' · '+propertyName(inspection(r.inspection_id).property_id):''}`,badge(r.status),`#report/${r.id}`)).join('')||empty('Nog geen rapporten beschikbaar',data.staff?'Maak een rapportconcept vanuit een inspectieronde.':'Uw rapport verschijnt hier zodra RoofSignal het heeft vrijgegeven.');}
function reportsPage(){return head('Rapportage','Rapporten',data.staff?'Controleer het concept en geef het bewust vrij aan de klant.':'Uw vrijgegeven inspectierapporten, per object en inspectiedatum.')+panel('Alle rapporten',reportRows(data.reports.filter(matches)));}
function reportPage(id) {
  const r=byId(data.reports,id);if(!r)return denied();const i=inspection(r.inspection_id);
  return `<a class="back" href="#reports">← Terug naar rapporten</a>`+head(i?propertyName(i.property_id):'Inspectierapport',r.title,`Inspectiedatum: ${date(i?.inspected_on)}`,data.staff?(r.status==='published'?button('Vrijgave intrekken','report.withdraw',id,true):button('Rapport vrijgeven','report.publish',id)):'')+
    `<div class="columns"><div>${panel('Samenvatting',`<div class="panelbody">${badge(r.status)}<p class="report-text">${esc(r.summary)}</p></div>`)}${panel('Bevindingen & advies',`<div class="panelbody">${observations(data.observations.filter(o=>o.inspection_id===r.inspection_id))||empty('Nog geen bevindingen')}</div>`)}</div><div>${panel('Rapportbestand',`<div class="panelbody">${r.has_file?`<h3>${esc(r.file_name)}</h3><p>${Math.ceil(r.file_size/1024)} kB · PDF</p><a class="btn" href="/api/reports/${r.id}/file" download>Download rapport</a>`:`<p class="muted">${data.staff?'Er is nog geen PDF toegevoegd.':'U kunt het rapport en de bevindingen op deze pagina lezen.'}</p>`}${data.staff&&!r.published_at?`<div class="buttons">${button(r.has_file?'PDF vervangen':'PDF toevoegen','report.upload',id,true)}</div><input type="file" class="upload" id="report-file" accept="application/pdf" data-report="${r.id}"><p class="hint">PDF · maximaal 10 MB</p>`:''}${r.published_at?`<p class="hint">Vrijgegeven op ${date(r.published_at)}</p>`:''}</div>`)}${data.staff?'<p class="hint">Een vrijgegeven inspectie blijft bewaard. Gebruik een nieuwe inspectieronde voor latere waarnemingen.</p>':''}</div></div>`;
}
function visitRows(visits){return visits.map(v=>row(date(v.proposed_on),`${propertyName(v.property_id)} · ${v.title}`,badge(v.status))).join('')||empty('Nog geen datumvoorstel','Een volgende inspectieronde wordt in overleg gepland.');}
function appointmentRows(items){return items.map(a=>row(dateTime(a.starts_at),`${propertyName(a.property_id)} · ${a.state==='confirmed'?'Afspraak bevestigd':a.state==='cancelled'?'Afspraak geannuleerd':'Nog af te stemmen'}`,'')).join('')||empty('Nog geen afspraken');}
function visitsPage(){return head('Planning','Afspraken','Uw inspectiemomenten en datumvoorstellen.')+panel('Afspraken',appointmentRows(data.appointments||[]))+panel('Datumvoorstellen',visitRows(data.visits));}
function requestRows(items){return items.map(r=>row(label(r.kind),`${propertyName(r.property_id)} · ${date(r.created_at)}`,badge(r.status),'#requests')).join('')||empty('Geen open verzoeken');}
function requestsPage() {
  return head('Contact & opvolging',data.staff?'Klantverzoeken':'Mijn verzoeken',data.staff?'Beantwoord vragen en volg meldingen op.':'Stel een vraag, meld herstel of geef een wijziging door.',!data.staff&&data.properties.some(p=>p.can_request)?button('Verzoek indienen','request.new'):'')+
    data.requests.filter(matches).map(r=>panel(esc(label(r.kind)),`<div class="panelbody">${badge(r.status)}<p><small>${esc(propertyName(r.property_id))} · ${date(r.created_at)}</small></p><p class="request-message">${esc(r.message)}</p>${r.preferred_on?`<p><small>Voorkeursdatum: ${date(r.preferred_on)}</small></p>`:''}${r.kind==='repair'?'<p class="hint">Dit is een herstelmelding van de klant; nog geen nieuwe beoordeling door RoofSignal.</p>':''}${r.response?`<div class="response"><b>Reactie RoofSignal</b><br>${esc(r.response)}</div>`:''}${data.staff?`<div class="buttons">${button('Behandelen','request.respond',r.id,true)}</div>`:''}</div>`)).join('')+(data.requests.length?'':empty('Nog geen verzoeken'));
}
function profilePage(){return head('Uw account','Mijn gegevens','Werk uw naam en telefoonnummer bij.')+panel('Contactgegevens',`<form class="form profile-form" data-command="profile.save">${field('name','Naam','text',data.person.name)}${field('phone','Telefoonnummer','tel',data.person.phone,false)}<p class="form-error" hidden></p><button class="btn">Gegevens opslaan</button></form>`);}
function sourceOrderPanel(source){return panel('Websiteboeking',`<div class="panelbody"><p><b>${esc(intakeSource(source.source))}</b> · ${esc(source.reference)}</p><p>${esc(intakeState(source.state))}</p><p>Afgesproken totaal: <b>${esc(money(source.total_cents))}</b></p>${source.source==='parken'?'<p class="hint">De pilotboeking bevat geen geverifieerde betaalstatus.</p>':''}${source.identity_review?'<p class="form-error">Contact- of objectgegevens controleren.</p>':''}${source.financial_review?'<p class="form-error">Controleer de oorspronkelijke prijsafspraak.</p>':''}<a class="text-button" href="#incoming/${source.id}">Bekijk oorspronkelijke boeking →</a></div>`);}
function intakeChoice(item){
 const r=item.record||{},d=r.intake_details,p=item.commercial||r.quote||r;
 if(item.source==='consumer')return p.inspection_type==='thermal'?'Thermografische inspectie':p.thermal?'Dak- en gevelinspectie met thermografie':'Dak- en gevelinspectie';
 if(item.source==='parken')return p.thermography_selected?'Woningscan met thermografie':'Woningscan De Parken';
 return d?d.inspection_type==='thermal'?'Thermografische inspectie':d.thermal?'Dak- en gevelinspectie met thermografie':'Dak- en gevelinspectie':r.scope||'VvE-inspectieaanvraag';
}
function intakePriceRows(parts){return `<dl class="intake-prices">${parts.filter(([,value])=>Number.isInteger(value)).map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(money(value))}</dd></div>`).join('')}</dl>`;}
function intakeDetails(item){
 const r=item.record||{},p=item.commercial||r.quote||r,d=r.intake_details;let html=`<p><b>${esc(intakeChoice(item))}</b></p>`;
 if(item.source==='consumer'){
  html+=intakePriceRows([...(p.base_cents?[['Gebouwschilinspectie',p.base_cents]]:[]),...(p.thermal_cents?[['Thermografie',p.thermal_cents]]:[]),['Reiskosten',p.travel_cents]]);
  if(p.base_cents===null||p.thermal_cents===null)html+='<p class="hint">Uitsplitsing van de oorspronkelijke prijs controleren.</p>';
  if(item.payment_id)html+=`<p>Mollie: <b>${esc(item.payment_id)}</b><br>${esc(({paid:'Betaald',open:'Nog niet betaald',pending:'Betaling in behandeling',authorized:'Betaling in behandeling',canceled:'Betaling afgebroken',failed:'Betaling mislukt',expired:'Betaaltermijn verlopen'})[item.payment_status]||'Betaalstatus onbekend')}</p>`;
 }
 if(item.source==='parken')html+=intakePriceRows([['Woningscan · excl. btw',p.inspection_excl_cents],...(p.thermography_selected?[['Thermografie · excl. btw',p.thermography_excl_cents]]:[])]);
 if(item.source==='vve'&&d){
  if(Number.isInteger(d.address_count))html+=`<p>${esc(d.address_count)} adressen opgegeven${d.kvk_number?`<br>KVK: ${esc(d.kvk_number)} (opgegeven)`:''}</p>`;
  if(d.price_indication?.kind==='indication')html+=intakePriceRows([...(d.price_indication.building_envelope_excl_cents?[['Gebouwschilinspectie · excl. btw',d.price_indication.building_envelope_excl_cents]]:[]),...(d.price_indication.thermal_excl_cents?[['Thermografie · excl. btw',d.price_indication.thermal_excl_cents]]:[])]);
 }
 return html;
}
function incomingIdentity(item){const r=item.record||{},a=r.quote?.address;return {name:r.customer?.name||r.organization||r.name||'Aanvraag',email:r.customer?.email||r.email||'',phone:r.customer?.phone||r.intake_details?.phone||r.phone||'',address:item.source==='consumer'?`${a?.street||''} ${a?.houseNumber||''}, ${a?.postcode||''} ${a?.city||''}`:item.source==='parken'?`${r.street||''} ${r.house_number||''}, ${r.postcode||''} Apeldoorn`:r.intake_details?`${r.intake_details.object_address||''}, ${r.postcode||''} ${r.intake_details.object_city||''}`:r.postcode||''};}
function incomingPage(id){
 if(!data.staff)return denied();
 const intro=head('Website','Websiteboekingen','Consumentenboekingen, De Parken en VvE-aanvragen.',button('Vernieuwen','incoming.reload','',true));
 if(incomingLoading||!incomingData&&!incomingError)return intro+panel('Ingekomen',empty('Boekingen laden…'));
 if(incomingError)return intro+panel('Ingekomen',`<div class="panelbody"><p class="form-error">${esc(incomingError)}</p>${button('Opnieuw proberen','incoming.reload')}</div>`);
 if(id){const item=incomingData.items.find(i=>i.id===id);if(!item)return denied();const identity=incomingIdentity(item),r=item.record;
  return `<a class="back" href="#incoming">← Alle websiteboekingen</a>`+head(intakeSource(item.source),identity.name,item.reference)+`<div class="columns"><div>${panel('Oorspronkelijke registratie',`<div class="panelbody"><p><b>${esc(intakeState(item.state))}</b></p>${intakeDetails(item)}<p>${esc(identity.address)}</p><p>${esc(identity.email)}${identity.phone?'<br>'+esc(identity.phone):''}</p>${r.customer?.notes||r.notes?`<p class="request-message">${esc(r.customer?.notes||r.notes)}</p>`:''}${item.source==='vve'?`<p class="request-message">${esc(r.message||'')}</p><p class="hint">Dit is een vrijblijvende aanvraag. De staffelprijs wordt vóór een opdracht afgestemd.</p>`:''}<div class="buttons">${item.order_id?`<a class="btn" href="#order/${item.order_id}">Opdracht openen</a>`:''}${item.organization_id?`<a class="btn secondary" href="#customer/${item.organization_id}">Klant openen</a>`:''}</div></div>`)}</div><div>${panel('Afspraak en betaling',`<div class="panelbody"><p>${item.source==='vve'?'Prijsindicatie':'Totaal'}: <b>${esc(item.source==='vve'&&r.intake_details?.price_indication?.kind==='custom'?'Op maat':money(item.source==='vve'?r.intake_details?.price_indication?.total_incl_cents:item.total_cents))}</b></p><p>${item.source==='parken'?'Betaalstatus niet gekoppeld':item.source==='vve'?'Nog geen opdracht of betaling':esc(intakeState(item.state))}</p>${r.slot_start?`<p>${esc(dateTime(r.slot_start))}</p>`:r.slot_date?`<p>${esc(date(r.slot_date))} · ${esc(r.slot_time)}</p>`:''}${item.identity_review?'<p class="form-error">Contact- of objectgegevens controleren. Het gekoppelde dossier is behouden.</p>':''}${item.financial_review?'<p class="form-error">Prijsafspraak controleren. Het oorspronkelijke bedrag blijft bewaard.</p>':''}<small>Ontvangen: ${esc(dateTime(item.changed_at))}</small></div>`)}</div></div>`;
 }
 return intro+panel('Ingekomen',incomingData.items.filter(item=>matches(item)||matches(incomingIdentity(item))).map(item=>{const p=incomingIdentity(item);return row(p.name,`${intakeSource(item.source)} · ${p.address} · ${item.reference}`,`<span class="tag ${item.state==='paid_confirmed'?'green':'orange'}">${esc(intakeState(item.state))}</span>`,`#incoming/${item.id}`);}).join('')||empty('Nog geen websiteboekingen','Nieuwe boekingen en aanvragen verschijnen hier na synchronisatie.'));
}
async function loadIncoming(force=false){
 if(!data?.staff||incomingLoading||incomingData&&!force)return;const version=++incomingVersion,generation=authVersion;incomingLoading=true;incomingError='';
 try{const result=await rpc('intake.snapshot',{});if(version!==incomingVersion||generation!==authVersion)return;if(!Array.isArray(result.items))throw new Error('De boekingen konden niet worden geladen.');incomingData=result;}
 catch(e){if(version===incomingVersion&&generation===authVersion)incomingError=e.message;}
 finally{if(version===incomingVersion&&generation===authVersion){incomingLoading=false;if(location.hash.startsWith('#incoming'))render();}}
}
const accessRole=value=>({reader:'Dossier lezen',contact:'Contact en verzoeken',finance:'Financieel contact'})[value]||value;
function accessPage() {
  if(!canManageAccess())return denied();
  const intro=head('Beheer','Toegang','Bepaal wie toegang heeft tot welke klant en objecten.',accessData?.people.length&&accessData?.organizations.length?button('Toegang toevoegen','access.new'):'');
  if(accessLoading||!accessData&&!accessError)return intro+panel('Dossiertoegang','<p class="empty" role="status">Toegang laden…</p>');
  if(accessError)return intro+panel('Dossiertoegang',`<div class="panelbody"><p class="form-error" role="alert">${esc(accessError)}</p>${button('Opnieuw proberen','access.reload')}</div>`);
  const person=id=>accessData.people.find(p=>p.user_id===id),org=id=>accessData.organizations.find(o=>o.id===id),prop=id=>accessData.properties.find(p=>p.id===id);
  return intro+panel('Dossiertoegang',accessData.grants.map(g=>row(person(g.user_id)?.name||person(g.user_id)?.email||'Gebruiker',`${org(g.organization_id)?.name||'Klant'} · ${g.property_id?prop(g.property_id)?.name||'Object':'Alle objecten'} · ${accessRole(g.role)}${g.expires_at?' · tot '+date(g.expires_at):''}`,g.revoked_at?'<span class="tag">Ingetrokken</span>':`${g.expires_at&&Date.parse(g.expires_at)<=Date.now()?'<span class="tag">Verlopen</span>':''}${button('Intrekken','access.revoke',g.id,true)}`)).join('')||empty('Nog geen dossiertoegang','Voeg toegang toe voor een bestaande gebruiker en klant.'))+panel('Medewerkers',accessData.staff.map(s=>row(person(s.user_id)?.name||'Medewerker',s.role==='administrator'?'Beheerder':'Medewerker',`<span class="tag ${s.active?'green':''}">${s.active?'Actief':'Ingetrokken'}</span>`)).join('')||empty('Geen medewerkers'));
}
async function loadAccess(force=false) {
  if(!canManageAccess()||accessLoading||accessData&&!force)return;
  const generation=authVersion,version=++accessVersion;accessLoading=true;accessError='';
  try {const result=await rpc('access.snapshot');if(generation!==authVersion||version!==accessVersion)return;
    if(!['people','organizations','properties','grants','staff'].every(k=>Array.isArray(result[k])))throw new Error('De toegangsgegevens konden niet worden geladen.');accessData=result;
  }catch(e){if(generation===authVersion&&version===accessVersion)accessError=e.message;}
  finally{if(generation===authVersion&&version===accessVersion){accessLoading=false;if(location.hash==='#access')render();}}
}
function accessPropertyOptions(org) {return [['','Alle objecten van deze klant'],...accessData.properties.filter(p=>p.organization_id===org).map(p=>[p.id,p.name])];}
function newAccess() {
  if(!canManageAccess()||!accessData?.people.length||!accessData?.organizations.length)return;
  const org=accessData.organizations[0].id;
  showForm('Toegang toevoegen','access.grant',select('user_id','Gebruiker',accessData.people.map(p=>[p.user_id,`${p.name||p.email||'Gebruiker'}${p.name&&p.email?' · '+p.email:''}`]))+select('organization_id','Klant',accessData.organizations.map(o=>[o.id,o.name]))+select('property_id','Objecten',accessPropertyOptions(org))+select('role','Rechten',['reader','contact','finance'].map(role=>[role,accessRole(role)]))+field('expires_at','Vervalt op (optioneel)','datetime-local','',false),{},'Toegang toevoegen');
  dialog.querySelector('[name="property_id"]').required=false;
}
function denied(){return head('Dossier','Niet beschikbaar','Dit onderdeel is niet beschikbaar voor uw account.')+'<a class="btn secondary" href="#overview">Terug naar overzicht</a>';}
function render() {
  if(!data)return;
  const [route='overview',id,org]=location.hash.slice(1).split('/');
  const content=({overview,customers,telephony:telephonyPage,call:telephonyPage,objects,orders:ordersPage,reports:reportsPage,requests:requestsPage,visits:visitsPage,profile:profilePage,access:accessPage,incoming:()=>incomingPage(id)})[route];
  const page=content?content():route==='customer'?customerPage(id):route==='object'?objectPage(id,org):route==='order'?orderPage(id):route==='report'?reportPage(id):denied();
  const search=['customers','objects','orders','reports','requests','incoming'].includes(route)?`<input id="search" class="search" type="search" value="${esc(query)}" placeholder="Zoek in dit overzicht…" aria-label="Zoeken in dit overzicht">`:`<small>${esc(data.person.name)}</small>`;
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="wordmark">ROOF<span>SIGNAL</span></div><small>PROPERTY INTELLIGENCE</small></div><div><p class="nav-label">${data.staff?'Werkruimte':'Klantportaal'}</p><nav class="nav" aria-label="Werkruimten">${navigation(route)}</nav></div><div class="sidebar-foot"><strong>${esc(data.person.name)}</strong><small>${data.staff?'RoofSignal backoffice':'Uw persoonlijke dossier'}</small><button data-action="logout">Uitloggen →</button></div></aside><div class="workspace"><header class="topbar"><span>${data.staff?'RoofSignal / Backoffice':'RoofSignal / Klantportaal'}</span>${search}${data.staff&&pendingCallRoute?button('Oproep openen','call.open','',true):''}<button class="text-button mobile-signout" data-action="logout">Uitloggen</button></header><main class="page" id="main">${page}</main></div></div>`;
  if(route==='call'&&data.staff)startCallRoute();
  if(route==='incoming'&&data.staff&&!incomingData&&!incomingError&&!incomingLoading)void loadIncoming();
  if(route==='access'&&canManageAccess()&&!accessData&&!accessError&&!accessLoading)void loadAccess();
}

function showForm(title,command,fields,context={},submit='Opslaan') {
  dialog.innerHTML=`<div class="dialoghead"><h2 id="dialog-title">${esc(title)}</h2><button class="close" type="button" data-action="close" aria-label="Sluiten">×</button></div><form class="form" data-command="${esc(command)}">${fields}<p class="form-error" role="alert" hidden></p><div class="buttons"><button type="button" class="btn secondary" data-action="close">Annuleren</button><button type="submit" class="btn">${esc(submit)}</button></div></form>`;
  dialog.querySelector('form')._context=context;dialog.showModal();
}
function newCustomer(phone='',fromCall=false){
  if(!data?.staff)return;cancelPhoneLookup();
  showForm('Klant toevoegen','organization.create',field('name','Klantnaam')+select('kind','Type klant',['private','vve','business','manager'].map(k=>[k,label(k)]))+field('contact_name','Contactpersoon','text','',false)+field('email','E-mailadres','email','',false)+field('phone','Telefoonnummer','tel',phone,false),{},'Klant toevoegen');
  if(fromCall)dialog.querySelector('form').dataset.callRoute=location.hash;
}
function objectOptions(org,requestOnly=false){return data.properties.filter(p=>(!org||p.organization_id===org)&&(!requestOnly||p.can_request)).map(p=>[`${p.id}/${p.organization_id}`,`${p.name} · ${orgName(p.organization_id)}`]);}
function newOrder(selected='') {
  if(!data.properties.length){toast('Voeg eerst een klant en object toe.');return;}
  showForm('Nieuwe opdracht','order.create',select('object','Object',objectOptions(),selected)+field('title','Opdrachttitel')+select('service','Dienst',['inspection','inspection_thermal','thermal','construction','photogrammetry'].map(k=>[k,label(k)]))+area('scope','Afgesproken scope','',false)+field('report_due_on','Rapportdeadline','date','',false)+area('internal_note','Interne notitie','',false),{},'Opdracht aanmaken');
}
function newObservation(id) {
  const i=inspection(id);if(!i)return;
  const existing=[...new Map(data.observations.filter(o=>o.property_id===i.property_id).map(o=>[o.finding_id,o])).values()];
  showForm('Bevinding vastleggen','observation.create',select('finding_id','Aandachtspunt',[['','Nieuw aandachtspunt'],...existing.map(o=>[o.finding_id,o.title])])+`<div id="new-finding">${field('title','Titel')}${field('component','Bouwdeel')}</div>`+select('assessment','Beoordeling',['observed','unchanged','worse','improved','not_visible'].map(k=>[k,label(k)]))+select('severity','Prioriteit',['low','medium','high'].map(k=>[k,label(k)]),'medium')+area('description','Waarneming')+area('recommendation','Advies'),{inspection_id:id});
  // Empty value means creating a new finding, so it is a valid selection.
  dialog.querySelector('[name="finding_id"]').required=false;
}
function action(name,id='') {
  if(name==='close'){dialog.close();return;}
  if(name==='bootstrap'){void bootstrap();return;}
  if(name==='auth.login'||name==='auth.forgot'){if(authBusy)return;authView=name==='auth.forgot'&&config?.passwordRecovery?'forgot':'login';welcome();return;}
  if(name==='reload'){load();return;}
  if(name==='logout'){sessionEnded();location.hash='';request('/api/logout',{method:'POST'}).catch(()=>toast('Uitloggen op de server is niet gelukt. Probeer opnieuw.'));return;}
  if(!data)return;cancelPhoneLookup();
  if(name==='call.open'&&data.staff){const route=pendingCallRoute||location.hash;pendingCallRoute=null;handledCallRoute=null;if(dialog.open)dialog.close();if(location.hash===route)render();else location.hash=route;return;}
  if(name==='call.ignore'&&data.staff){pendingCallRoute=null;handledCallRoute=location.hash;dialog.querySelector('.pending-call')?.remove();callView={status:'idle',phone:'',result:null,error:''};render();return;}
  if(name==='incoming.reload'&&data.staff){incomingData=null;incomingError='';void loadIncoming(true);render();return;}
  if(name==='access.reload'&&canManageAccess()){accessData=null;accessError='';void loadAccess(true);render();return;}
  if(name==='access.new'){newAccess();return;}
  if(name==='access.revoke'&&canManageAccess()){const grant=accessData?.grants.find(g=>g.id===id&&!g.revoked_at);if(grant)showForm('Toegang intrekken','access.revoke','<p>Deze gebruiker kan dit dossier na het intrekken niet meer openen.</p>',{id},'Toegang intrekken');return;}
  if(name==='organization.new')newCustomer(id);
  if(name==='property.new') {
    if(!data.organizations.length){toast('Voeg eerst een klant toe.');return;}
    showForm('Object toevoegen','property.create',select('organization_id','Klant',data.organizations.map(o=>[o.id,o.name]),id)+field('name','Objectnaam')+field('address','Straat en huisnummer(s)')+`<div class="form-grid">${field('postcode','Postcode','text','',false)}${field('city','Plaats')}</div>`,{},'Object toevoegen');
  }
  if(name==='order.new')newOrder(id);
  if(name==='order.status'){const o=byId(data.orders,id);showForm('Opdrachtstatus','order.status',select('status','Status',['draft','active','completed','cancelled'].map(k=>[k,label(k)]),o.status),{id});}
  if(name==='inspection.new')showForm('Inspectieronde toevoegen','inspection.create',field('label','Naam van de ronde','text','Vervolginspectie')+field('proposed_on','Datumvoorstel','date','',false)+field('inspected_on','Werkelijke inspectiedatum','date','',false)+'<p class="hint">Een datumvoorstel reserveert nog geen agendatijd.</p>',{order_id:id});
  if(name==='inspection.date')showForm('Inspectiedatum vastleggen','inspection.date',field('inspected_on','Werkelijke inspectiedatum','date',inspection(id).inspected_on||''),{id});
  if(name==='observation.new')newObservation(id);
  if(name==='report.new'){const r=reportFor(id);showForm('Rapportconcept','report.save',field('title','Titel','text',r?.title||`Inspectierapport · ${propertyName(inspection(id).property_id)}`)+area('summary','Samenvatting',r?.summary||''),{inspection_id:id},'Concept opslaan');}
  if(name==='report.publish'){const r=byId(data.reports,id),i=inspection(r.inspection_id);showForm('Rapport vrijgeven','report.publish',`<p><b>${esc(r.title)}</b></p><p>Dit rapport en de bijbehorende bevindingen worden zichtbaar voor de bevoegde dossierlezers van <b>${esc(orgName(i.organization_id))}</b>.</p>`,{id},'Vrijgeven aan klant');}
  if(name==='report.withdraw')showForm('Vrijgave intrekken','report.withdraw','<p>Dit rapport en de bijbehorende bevindingen verdwijnen uit het klantportaal. De inspectiehistorie blijft intern bewaard.</p>',{id},'Vrijgave intrekken');
  if(name==='report.upload')document.querySelector('#report-file').click();
  if(name==='request.new')showForm('Verzoek indienen','request.create',select('object','Object',objectOptions(null,true),id)+select('kind','Waarmee kunnen we helpen?',['question','inspection','move','repair','correction'].map(k=>[k,label(k)]))+area('message','Toelichting')+field('preferred_on','Voorkeursdatum (optioneel)','date','',false),{},'Verzoek indienen');
  if(name==='request.respond'){const r=byId(data.requests,id);showForm('Verzoek behandelen','request.respond',`<p class="request-message">${esc(r.message)}</p>`+select('status','Status',['open','in_progress','closed'].map(k=>[k,label(k)]),r.status)+area('response','Reactie aan klant',r.response,false),{id});}
}

document.addEventListener('click',e=>{
  const loginButton=e.target.closest('[data-account]');if(loginButton){login(loginButton.dataset.account);return;}
  const target=e.target.closest('[data-action]');if(target)action(target.dataset.action,target.dataset.id);
});
account.addEventListener('change',()=>login(account.value));
window.addEventListener('hashchange',()=>{cancelPhoneLookup();handledCallRoute=null;query='';if(data?.staff&&/^#call(?:\/|$)/.test(location.hash)&&dialog.open)holdIncomingCall();render();window.scrollTo({top:0});});
document.addEventListener('input',e=>{
  if(e.target.id==='search'){const cursor=e.target.selectionStart;query=e.target.value.toLocaleLowerCase('nl');render();const search=document.querySelector('#search');search.focus();search.setSelectionRange(cursor,cursor);}
  const form=e.target.closest('form[data-command]');if(form)delete form.dataset.requestId;
});
document.addEventListener('change',async e=>{
  if(e.target.name==='organization_id'&&e.target.closest('form')?.dataset.command==='access.grant'&&accessData){const selector=dialog.querySelector('[name="property_id"]');selector.innerHTML=accessPropertyOptions(e.target.value).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');selector.value='';}
  if(e.target.name==='finding_id'){
    const fresh=!e.target.value;dialog.querySelector('#new-finding').hidden=!fresh;
    dialog.querySelectorAll('#new-finding input').forEach(input=>{input.required=fresh;input.disabled=!fresh;});
  }
  if(e.target.id==='report-file'&&e.target.files[0]){
    const file=e.target.files[0],id=e.target.dataset.report;
    if(file.size>10485760){toast('De PDF mag maximaal 10 MB zijn.');return;}
    const btn=document.querySelector('[data-action="report.upload"]');btn.disabled=true;
    try{await request(`/api/reports/${id}/file`,{method:'POST',headers:{'Content-Type':'application/pdf','X-Request-Id':crypto.randomUUID(),'X-File-Name':encodeURIComponent(file.name)},body:file});await load();toast('PDF veilig toegevoegd.');}
    catch(err){toast(err.message);btn.disabled=false;}
  }
});
document.addEventListener('submit',async e=>{
  const authForm=e.target.closest('form[data-auth]');if(authForm){e.preventDefault();void submitAuth(authForm);return;}
  const callForm=e.target.closest('form[data-phone-lookup]');if(callForm){e.preventDefault();void lookupPhone(new FormData(callForm).get('phone')||'');return;}
  const form=e.target.closest('form[data-command]');if(!form)return;e.preventDefault();
  const generation=authVersion;
  const payload={...Object.fromEntries(new FormData(form)),...form._context};
  if(form.dataset.command==='access.grant'){payload.property_id=payload.property_id||null;payload.expires_at=payload.expires_at?new Date(payload.expires_at).toISOString():null;}
  if(payload.object){[payload.property_id,payload.organization_id]=payload.object.split('/');delete payload.object;}
  form.dataset.requestId||=crypto.randomUUID();payload.request_id=form.dataset.requestId;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  const error=form.querySelector('.form-error');error.hidden=true;
  try {
    const result=await rpc(form.dataset.command,payload);if(generation!==authVersion)return;if(dialog.open)dialog.close();
    if(form.dataset.command.startsWith('access.'))accessData=null;
    await load();if(generation!==authVersion)return;
    if(form.dataset.command==='order.create')location.hash=`order/${result.id}`;
    if(form.dataset.command==='property.create')location.hash=`object/${result.id}/${payload.organization_id}`;
    if(form.dataset.command==='organization.create')location.hash=`customer/${result.id}`;
    if(form.dataset.command==='report.save')location.hash=`report/${result.id}`;
    toast('Opgeslagen.');
  }catch(err){if(generation!==authVersion)return;error.textContent=err.message;error.hidden=false;buttons.forEach(b=>b.disabled=false);}
});
bootstrap();
