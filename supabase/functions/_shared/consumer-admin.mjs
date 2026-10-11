// New Supabase secret API keys are sent in apikey, not as bearer JWTs.
// Only keys supplied by the trusted function environment can authorize tests.
export function consumerAdminKeys(legacy, encoded) {
  let named={};
  try { named=JSON.parse(encoded||'{}'); } catch { /* Fail closed for new keys. */ }
  const secret=typeof named?.default==='string'&&named.default.startsWith('sb_secret_')?named.default:'';
  return {legacy:typeof legacy==='string'?legacy:'',secret};
}
export function isConsumerAdmin(headers,keys) {
  return Boolean((keys.secret&&headers.get('apikey')===keys.secret)
    ||(keys.legacy&&headers.get('authorization')==='Bearer '+keys.legacy));
}
