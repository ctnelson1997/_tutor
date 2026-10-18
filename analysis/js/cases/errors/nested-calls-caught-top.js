// An error thrown three calls deep (and from recursion) caught at top level; frames unwind, finally blocks run
function parseItem(text) {
  const n = Number(text);
  if (Number.isNaN(n)) {
    throw new Error(`not a number: "${text}"`);
  }
  return n;
}

function parseList(texts) {
  const out = [];
  for (const t of texts) {
    out.push(parseItem(t));
  }
  return out;
}

function total(texts) {
  try {
    const nums = parseList(texts);
    return nums.reduce((a, b) => a + b, 0);
  } finally {
    console.log("total() finished for", texts.length, "items");
  }
}

let good, bad;
good = total(["1", "2", "3"]);
try {
  bad = total(["4", "x", "6"]);
} catch (e) {
  console.log("top caught:", e.message);
}
console.log(good, bad);

function depth(n) {
  if (n === 0) throw new RangeError("hit bottom");
  return depth(n - 1) + 1;
}
let reached = "none";
try {
  reached = depth(4);
} catch (e) {
  reached = e.name;
}
console.log(reached);
