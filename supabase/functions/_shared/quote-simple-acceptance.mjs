export function acceptanceRecipientMatches(name, email, recipient) {
  return name === recipient?.contact_name && email.toLowerCase() === String(recipient?.contact_email || '').toLowerCase();
}
export async function stampSimpleAcceptance(bytes, details, { PDFDocument, StandardFonts, rgb }) {
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new Error('Offerte bevat geen pagina’s.');
  const page = pdf.getPages().at(-1);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const moment = new Intl.DateTimeFormat('nl-NL', {dateStyle:'long', timeStyle:'medium', timeZone:'Europe/Amsterdam'}).format(details.acceptedAt);
  page.drawText(`Digitaal akkoord: ${details.actorName}`, {x:56,y:92,size:9,font,color:rgb(.063,.09,.082)});
  page.drawText(`${details.actorEmail} | ${moment}`, {x:56,y:78,size:9,font,color:rgb(.36,.4,.38)});
  return new Uint8Array(await pdf.save());
}
