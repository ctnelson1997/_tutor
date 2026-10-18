// JSON.parse SyntaxErrors (message text, instanceof) and optional catch binding (catch with no parameter)
function parseOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const inputs = ['{"a": 1, "b": [true, null]}', "{a: 1}", "[1, 2,]", "", '"ok"'];
const parsed = inputs.map(parseOrNull);
console.log(parsed);

for (const text of ["{a: 1}", "[1, 2,]", "", "tru"]) {
  try {
    JSON.parse(text);
  } catch (e) {
    console.log(e.name, e instanceof SyntaxError, "-", e.message);
  }
}

let config = { debug: false };
const raw = '{"debug": true, "level": 3}';
try {
  config = { ...config, ...JSON.parse(raw) };
} catch {
  console.log("keeping defaults");
}
console.log(config);
