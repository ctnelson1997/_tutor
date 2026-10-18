// calling an async function without await: the caller keeps going before it finishes
const events = [];
function log(s) {
  events.push(s);
  console.log(s);
}
async function saveLater(item) {
  log("save start " + item);
  await new Promise((r) => setTimeout(r, 10));
  log("save done " + item);
  return item.length;
}
function handleClick() {
  log("click");
  saveLater("draft");
  log("click handler returns");
  return "handled";
}
const r = handleClick();
log("result " + r);
const pending = saveLater("final");
log("pending is a " + pending.constructor.name);
pending.then((n) => log("final length " + n));
