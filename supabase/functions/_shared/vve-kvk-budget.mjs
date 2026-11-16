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
