// Apps Script may prefix thrown errors with "Error: ". Only named machine
// codes may affect booking state; never use arbitrary execution text as one.
export function googleExecutionError(message) {
  if(typeof message!=='string')return 'CALENDAR_UNAVAILABLE';
  const match=/^(?:Error: )?([A-Z][A-Z_0-9]{1,79})$/.exec(message);
  return match?match[1]:'CALENDAR_UNAVAILABLE';
}

// Single in-flight refresh for parallel route reads. Memory-only; secrets and
// access tokens are never persisted or returned to the browser.
export function googleTokenProvider(load,clock=Date.now) {
 let current=null;
 return async function tokenFor(identity) {
  if(current?.identity===identity&&current.expiresAt>clock())return current.promise;
  const entry={identity,expiresAt:Infinity,promise:null};
  current=entry;
  entry.promise=Promise.resolve().then(load).then(token=>{
   if(!token.access_token)throw Error('CALENDAR_AUTH_REQUIRED');
   entry.expiresAt=clock()+Math.max(0,Math.min(Number(token.expires_in)||300,3600)-60)*1000;
   return token.access_token;
  }).catch(error=>{if(current===entry)current=null;throw error;});
  return entry.promise;
 };
}
