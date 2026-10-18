// Uses Sets to track unique visitors and compute union, intersection and difference
const monday = ["ana", "ben", "cho", "ana", "dev", "ben"];
const tuesday = ["cho", "eli", "ana", "fay", "eli"];

const mondaySet = new Set(monday);
const tuesdaySet = new Set(tuesday);
console.log("Monday visits:", monday.length, "unique:", mondaySet.size);
console.log("Tuesday visits:", tuesday.length, "unique:", tuesdaySet.size);

const both = new Set();
for (const name of mondaySet) {
  if (tuesdaySet.has(name)) both.add(name);
}
const either = new Set([...mondaySet, ...tuesdaySet]);
const onlyMonday = [...mondaySet].filter(name => !tuesdaySet.has(name));

console.log("Came both days:", [...both]);
console.log("Came either day:", [...either].sort());
console.log("Only Monday:", onlyMonday);

const returning = new Set();
const seen = new Set();
const log = [...monday, ...tuesday];
for (const name of log) {
  if (seen.has(name)) {
    returning.add(name);
  } else {
    seen.add(name);
  }
}
console.log("Returning visitors:", returning);
tuesdaySet.delete("fay");
console.log("Tuesday after removing fay:", tuesdaySet.size, tuesdaySet.has("fay"));
