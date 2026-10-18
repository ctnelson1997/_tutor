// Catching only some errors and rethrowing the rest to an outer handler, with the same error object
class NotFoundError extends Error {
  constructor(key) {
    super(`missing ${key}`);
    this.name = "NotFoundError";
    this.key = key;
  }
}

const store = { a: 1, b: 2 };

function lookup(key) {
  if (key === "bad") throw new TypeError("bad key type");
  if (!(key in store)) throw new NotFoundError(key);
  return store[key];
}

function lookupOrDefault(key) {
  try {
    return lookup(key);
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.log("defaulting for", err.key);
      return 0;
    }
    console.log("rethrowing", err.name);
    throw err;
  }
}

let rethrown = null;
const values = [];
for (const key of ["a", "zz", "bad", "b"]) {
  try {
    values.push(lookupOrDefault(key));
  } catch (outer) {
    rethrown = outer;
    console.log("outer caught", outer.message);
    values.push(-1);
  }
}
console.log(values, rethrown instanceof TypeError);
