// Calendar dates in the customer's Dutch time zone; never 14 x 24 hours.
// Sources: ACM bedenktijd; Algemene termijnenwet; Stcrt. 2025, 24713.
const DAY=86400000;
const equalized=new Set(['2026-01-02','2026-05-15','2027-05-07','2028-04-28','2028-05-26']);
export function dutchDay(value) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const part=t=>parts.find(p=>p.type===t).value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
function shift(day,days) {return new Date(Date.parse(day+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);}
function easter(year) {
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function isDutchWorkingDay(day,{legalDeadline=false}={}) {
 const date=new Date(day+'T12:00:00Z'),year=date.getUTCFullYear(),week=date.getUTCDay();
 const pasen=easter(year),king=new Date(`${year}-04-27T12:00:00Z`).getUTCDay()===0?`${year}-04-26`:`${year}-04-27`;
 const holidays=new Set([`${year}-01-01`,king,`${year}-05-05`,`${year}-12-25`,`${year}-12-26`,shift(pasen,-2),shift(pasen,1),shift(pasen,39),shift(pasen,50)]);
 return week!==0&&week!==6&&!holidays.has(day)&&(!legalDeadline||!equalized.has(day));
}
export function withdrawalLastDay(agreement) {
 let last=shift(dutchDay(agreement),14);
 // Review new equalized days before extending unattended booking past 2028.
 if(last>'2028-12-31'||last<'2026-01-01')throw Error('LEGAL_CALENDAR_REVIEW_REQUIRED');
 while(!isDutchWorkingDay(last,{legalDeadline:true}))last=shift(last,1);
 return last;
}
export function earlyStartRequired(start,agreement=Date.now()) {
 return dutchDay(start)<=withdrawalLastDay(agreement);
}
export function assertAfterWithdrawal(start,agreement=Date.now()) {
 if(earlyStartRequired(start,agreement))throw Error('AFTER_WITHDRAWAL_REQUIRED');
}
export function daysAfterWithdrawal(days,agreement=Date.now()) {
 return days.filter(day=>!earlyStartRequired(day.start,agreement));
}
export function reportDueDay(inspection) {
 let due=dutchDay(inspection),remaining=2;
 while(remaining){due=shift(due,1);if(isDutchWorkingDay(due))remaining--;}
 return due;
}
