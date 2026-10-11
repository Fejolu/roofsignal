// Apps Script may prefix thrown errors with "Error: ". Only named machine
// codes may affect booking state; never use arbitrary execution text as one.
export function googleExecutionError(message) {
  if(typeof message!=='string')return 'CALENDAR_UNAVAILABLE';
  const match=/^(?:Error: )?([A-Z][A-Z_0-9]{1,79})$/.exec(message);
  return match?match[1]:'CALENDAR_UNAVAILABLE';
}
