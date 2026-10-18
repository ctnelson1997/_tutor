// an error's stack as the program reads it: the first line follows the name set in the constructor, captureStackTrace, and a stack read early
class NotFoundError extends Error {
  constructor(what) {
    super(`${what} not found`);
    this.name = "NotFoundError";
    this.what = what;
  }
}
function find(items, target) {
  if (!items.includes(target)) throw new NotFoundError(target);
  return items.indexOf(target);
}
let caught;
try {
  find(["a", "b"], "z");
} catch (e) {
  caught = e;
}
console.log(caught.stack.split("\n")[0]);
console.log(caught.stack.includes("NotFoundError: z not found"), caught instanceof NotFoundError, caught.what);
const holder = { name: "Custom", message: "made by hand" };
Error.captureStackTrace(holder);
console.log(holder.stack.split("\n")[0]);
const early = new Error("first message");
const firstLine = early.stack.split("\n")[0];
early.message = "changed later";
console.log(firstLine, "|", early.stack.split("\n")[0], "|", String(early));
console.log(caught);
