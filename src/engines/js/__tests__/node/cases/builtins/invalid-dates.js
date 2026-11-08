// An invalid date (#88): a parse that fails gives an Invalid Date, returned and drawn, not a crash
function parse(text) {
  return new Date(text);
}
const d = parse('31/12/2020');
console.log(isNaN(d.getTime()));
const good = new Date(0);
const dates = [good, d];
console.log(dates.length, String(d), dates);
