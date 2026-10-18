// an async function that throws returns a rejected promise; .catch handles it after the synchronous code finishes
let attempts = 0;
let lastError = null;
let config = null;
async function loadConfig(name) {
  attempts++;
  console.log("loading", name);
  if (!name.endsWith(".json")) {
    throw new TypeError("not a JSON file: " + name);
  }
  return { name, ok: true };
}
const result = loadConfig("settings.txt");
console.log("returned a promise:", result instanceof Promise);
result
  .then((cfg) => console.log("never runs:", cfg))
  .catch((err) => {
    lastError = err.message;
    console.log("caught", err.name + ":", err.message);
    return loadConfig("settings.json");
  })
  .then((cfg) => {
    config = cfg;
    console.log("retry gave", cfg, "after", attempts, "attempts");
  });
console.log("script done");
