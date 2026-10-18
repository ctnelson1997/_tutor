// console.log with several arguments of mixed types, and an empty console.log()
const name = "Ada";
const age = 36;
const active = true;
const scores = [90, 85];
const profile = { name, age };
console.log("Name:", name, "Age:", age, "Active:", active);
console.log(1, "1", true, "true", null, undefined);
console.log("scores", scores, "profile", profile);
console.log();
console.log(age + 1, `${name} is ${age}`, age > 30 && active);
console.log("a" + 1 + 2, 1 + 2 + "a", "5" * "2", [] + {}, typeof null);
const summary = [name, age, active, scores.length];
console.log(...summary);
console.log("");
console.log("done");
