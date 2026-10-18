// several statements on one line: calls, declarations, assignments and one-line function bodies
const order = [];
function a() { order.push("a"); return 1; }
function b() { order.push("b"); return 2; }
function c() { order.push("c"); return 3; }
a(); b(); c();
console.log(order.join(""));
let x = a(), y = b(); let z = x + y; console.log("z", z);
let s = 0; for (let i = 0; i < 3; i++) { s += i; } console.log("s", s);
const p = { n: 1 }; p.n++; p.n *= 10; console.log(p);
function both() { const r = a() + c(); order.push("|"); return r; } console.log(both());
console.log(order.join(""));
