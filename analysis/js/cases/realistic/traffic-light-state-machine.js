// A traffic light state machine driven by a list of events, using a transition table
const transitions = {
  green: { timer: "yellow", emergency: "flashing" },
  yellow: { timer: "red", emergency: "flashing" },
  red: { timer: "green", emergency: "flashing" },
  flashing: { reset: "red" }
};

const durations = { green: 30, yellow: 5, red: 25, flashing: 0 };

let state = "red";
let clock = 0;
const history = [state];

function send(event) {
  const next = transitions[state][event];
  if (next === undefined) {
    console.log(`  ignored "${event}" while ${state}`);
    return false;
  }
  clock += durations[state];
  console.log(`${state} --${event}--> ${next} (t=${clock})`);
  state = next;
  history.push(state);
  return true;
}

const events = ["timer", "timer", "timer", "emergency", "timer", "reset", "timer"];
let accepted = 0;
for (const e of events) {
  if (send(e)) accepted++;
}
console.log("Final state:", state);
console.log("Accepted", accepted, "of", events.length, "events");
console.log("History:", history.join(" > "));
const visits = {};
history.forEach(s => (visits[s] = (visits[s] ?? 0) + 1));
console.log(visits);
