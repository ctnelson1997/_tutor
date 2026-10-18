// A countdown using setInterval/clearInterval, a cancelled setTimeout, and event-loop ordering
const events = [];
let remaining = 3;

console.log("Countdown starting");
const intervalId = setInterval(() => {
  console.log(`T-minus ${remaining}`);
  events.push(remaining);
  remaining--;
  if (remaining === 0) {
    clearInterval(intervalId);
    setTimeout(() => {
      console.log("Liftoff!");
      events.push("liftoff");
      console.log("Events:", events);
    }, 0);
  }
}, 10);

const cancelled = setTimeout(() => console.log("this never prints"), 5);
clearTimeout(cancelled);

setTimeout(() => {
  console.log("timeout callback");
  events.push("timeout");
}, 0);
Promise.resolve().then(() => {
  console.log("promise callback");
  events.push("promise");
});
queueMicrotask(() => console.log("microtask callback"));
console.log("Synchronous code finished");
events.push("sync");
