// Error.cause: wrapping a low-level error at each layer, then walking the cause chain
function readConfig(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("config is not valid JSON", { cause: err });
  }
}

function startApp(text) {
  try {
    const config = readConfig(text);
    return `started on port ${config.port}`;
  } catch (err) {
    throw new Error("app failed to start", { cause: err });
  }
}

const okMessage = startApp('{"port": 8080}');
console.log(okMessage);

const chain = [];
try {
  startApp("{port: 8080}");
} catch (err) {
  let current = err;
  while (current) {
    chain.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
}
console.log(chain.join("\n  caused by "));

const plain = new Error("no cause");
const withValue = new Error("value cause", { cause: 404 });
console.log("cause" in plain, plain.cause, withValue.cause, Object.keys(withValue));
