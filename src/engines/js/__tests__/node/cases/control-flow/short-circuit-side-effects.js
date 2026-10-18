// short-circuit && || ?? ?. and logical assignment skip calls that have side effects
const log = [];
function f(name, value) {
  log.push(name);
  return value;
}
const a = f("a", 0) && f("b", 1);
const b = f("c", 1) && f("d", "yes");
const c = f("e", "") || f("g", "fallback");
const d = f("h", "first") || f("i", "never");
const e = f("j", null) ?? f("k", 0);
const g = f("l", 0) ?? f("m", "never");
console.log(a, b, c, d, e, g);
console.log("called:", log.join(","));

let user = null;
const city = user?.address?.city;
console.log("city", city);
user = { address: { city: "Madison" }, greet() { return "hi"; } };
console.log(user?.address?.city, user.greet?.(), user.missing?.());

let count = 0;
let flag = false;
flag && count++;
flag || count++;
count > 0 && console.log("count is", count);
let opts = {};
opts.size ||= 10;
opts.size &&= opts.size * 2;
opts.name ??= "default";
console.log(opts);
