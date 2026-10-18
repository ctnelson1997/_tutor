// setTimeout callbacks run in order of delay (0, 5, 10), extra arguments, and clearTimeout
const fired = [];
setTimeout(() => {
  fired.push(0);
  console.log("delay 0");
}, 0);
setTimeout(() => {
  fired.push(10);
  console.log("delay 10");
}, 10);
setTimeout(() => {
  fired.push(5);
  console.log("delay 5");
}, 5);
setTimeout(() => {
  fired.push(20);
  console.log("delay 20; order was", fired);
}, 20);
setTimeout((a, b) => console.log("extra args:", a, b), 1, "x", 42);
const id = setTimeout(() => console.log("cancelled, never printed"), 3);
clearTimeout(id);
console.log("scheduled everything");
