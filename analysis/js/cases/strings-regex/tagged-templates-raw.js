// Tagged templates (strings array, values, strings.raw) and String.raw keeping backslashes
function highlight(strings, ...values) {
  console.log("parts:", strings.length, "values:", values.length);
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += `[${values[i]}]`;
  });
  return out;
}

const item = "tea";
const price = 3.5;
const line = highlight`The ${item} costs $${price.toFixed(2)} today`;
console.log(line);

function inspectRaw(strings) {
  return [strings[0].length, strings.raw[0].length, strings.raw[0]];
}
const rawInfo = inspectRaw`a\tb\n`;
console.log(rawInfo);

const path = String.raw`C:\new\temp\file.txt`;
console.log(path, path.length);
const pattern = String.raw`\d+\.\d+`;
console.log(pattern, new RegExp(pattern).test("pi is 3.14"));
console.log(String.raw`x=${1 + 1}\n`);

const upper = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (i < vals.length ? String(vals[i]).toUpperCase() : ""), "");
const shout = upper`hi ${item}, total ${price * 2}!`;
console.log(shout);
