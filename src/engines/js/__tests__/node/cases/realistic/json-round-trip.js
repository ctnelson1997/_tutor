// Serializes a gradebook to JSON and back, with pretty printing, a replacer and a reviver
const gradebook = {
  course: "CS 220",
  semester: "Fall",
  students: [
    { name: "Lena", scores: [88, 92], active: true },
    { name: "Omar", scores: [75, 81], active: false, notes: null }
  ],
  created: "2024-09-03"
};

const json = JSON.stringify(gradebook);
console.log("Compact length:", json.length);
console.log(json);

const pretty = JSON.stringify(gradebook.students[0], null, 2);
console.log(pretty);

const parsed = JSON.parse(json);
parsed.students.push({ name: "Ivy", scores: [99], active: true });
console.log("Original students:", gradebook.students.length, "copy:", parsed.students.length);
console.log("Same object?", parsed === gradebook);

const noScores = JSON.stringify(gradebook, (key, value) => (key === "scores" ? undefined : value));
console.log(noScores);

const withDate = JSON.parse(json, (key, value) => (key === "created" ? value.split("-").map(Number) : value));
console.log(withDate.created);

const tricky = { f: function () {}, u: undefined, n: NaN, inf: Infinity, list: [undefined, 1] };
console.log(JSON.stringify(tricky));

const deepCopy = JSON.parse(JSON.stringify(gradebook));
deepCopy.students[0].scores[0] = 0;
console.log(gradebook.students[0].scores[0], deepCopy.students[0].scores[0]);

try {
  JSON.parse("{name: 'bad json'}");
} catch (err) {
  console.log("Parse failed:", err.name);
}
