// A this alias kept through a loop, and functions reading this (#87): the global object shows the program's globals only
var that = this;
let total = 0;
for (let i = 0; i < 1000; i++) total += i;
function show() {
  return this === globalThis;
}
console.log(total, show(), that === globalThis);
console.log(that);
