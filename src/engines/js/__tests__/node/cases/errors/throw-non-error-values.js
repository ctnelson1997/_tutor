// Throwing non-Error values (string, number, object literal, null, array) and inspecting what catch receives
const thrownValues = [
  "just a string",
  42,
  { code: 404, reason: "not found" },
  null,
  [1, 2],
];

const report = [];
for (const value of thrownValues) {
  try {
    throw value;
  } catch (caught) {
    const kind = caught === null ? "null" : Array.isArray(caught) ? "array" : typeof caught;
    report.push(kind);
    console.log(kind, caught, caught instanceof Error);
  }
}
console.log(report.join(","));

function fail(code) {
  throw { code, message: `failed with ${code}` };
}

let lastCode;
try {
  fail(500);
} catch ({ code, message }) {
  lastCode = code;
  console.log("destructured:", code, message);
}
console.log(lastCode);
