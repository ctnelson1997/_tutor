// setInterval drives a countdown and is cleared after its third tick; a timeout set in between runs between ticks
const countdown = { remaining: 3, ticks: [] };
let timerId = null;
function tick() {
  countdown.ticks.push(countdown.remaining);
  console.log("T-minus", countdown.remaining);
  countdown.remaining--;
  if (countdown.ticks.length === 3) {
    clearInterval(timerId);
    console.log("liftoff after", countdown.ticks.length, "ticks");
  }
}
timerId = setInterval(tick, 50);
setTimeout(() => console.log("check at 75ms, remaining:", countdown.remaining), 75);
console.log("countdown started");
