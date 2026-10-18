// replace with $1/$2, $&, $$, and a replacer function (match, groups, offset) called once per match
const name = "Hopper, Grace";
console.log(name.replace(/(\w+), (\w+)/, "$2 $1"));
console.log("price: 42".replace(/\d+/, "$$$&.00"));
console.log("a-b-c".replace(/-/g, "[$&]"));

const calls = [];
const doubled = "3 apples and 12 pears".replace(/\d+/g, (match, offset) => {
  calls.push(`${match}@${offset}`);
  return String(Number(match) * 2);
});
console.log(doubled, calls);

function toCamel(str) {
  return str.replace(/[-_](\w)/g, (_, letter) => letter.toUpperCase());
}
function toKebab(str) {
  return str.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase());
}
const camel = toCamel("background-color_main");
console.log(camel, toKebab(camel));

const prices = { tea: 3, cake: 5 };
const template = "Tea is {tea}, cake is {cake}, pie is {pie}.";
const filled = template.replace(/\{(\w+)\}/g, (whole, key) => (key in prices ? `$${prices[key]}` : whole));
console.log(filled);

const censored = "darn this darn bug".replace(/darn/g, w => "*".repeat(w.length));
const counter = { n: 0 };
const numbered = "x x x".replace(/x/g, () => ++counter.n);
console.log(censored, numbered, counter.n);
