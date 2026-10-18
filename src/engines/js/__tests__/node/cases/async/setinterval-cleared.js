// setInterval ticks three times and is cleared from inside its own callback
let ticks = 0;
const history = [];
const id = setInterval(() => {
  ticks++;
  history.push("tick " + ticks);
  console.log("tick", ticks);
  if (ticks === 3) {
    clearInterval(id);
    console.log("cleared after", ticks, "ticks");
    setTimeout(() => console.log("history:", history.join(", ")), 20);
  }
}, 10);
console.log("interval started");
