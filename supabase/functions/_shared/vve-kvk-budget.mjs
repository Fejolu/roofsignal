// Mail delivery uses a durable claim. The scheduled worker retries failures.
export async function processKvkBudgetWarning({ claim, deliver, finish }) {
  const warning = await claim();
  if (!warning) return { sent: false };
  try {
    await deliver(warning);
  } catch {
    await finish(warning, false);
    throw new Error('KVK_BUDGET_WARNING_DELIVERY_FAILED');
  }
  await finish(warning, true);
  return { sent: true };
}

export function kvkBudgetMessage(warning) {
  return {
    subject: `RoofSignal – KVK-verbruik bereikt ${warning.threshold} opvragingen`,
    text: `In de kalendermaand vanaf ${warning.month} heeft de website ${warning.count} KVK-opvragingen gereserveerd.\n\nHet maandplafond is ${warning.limit}. Vanaf dat plafond stopt het automatisch ophalen van VvE-namen. Aanmelders kunnen de naam zelf invullen.\n\nDe teller omvat ook gereserveerde opvragingen die bij KVK mislukken. Raadpleeg het KVK-bestedingenoverzicht voor de daadwerkelijk gefactureerde kosten. Gebruik van de API-sleutel buiten deze website valt buiten deze teller.`
  };
}

export async function authorizeKvkBudgetWorker(request, secret) {
  if (!secret) return false;
  const timestamp = request.headers.get('x-roofsignal-budget-timestamp') || '';
  const signature = request.headers.get('x-roofsignal-budget-signature') || '';
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g), pair => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes,
    encoder.encode(`${timestamp}.kvk-budget-warning:v1`));
}
