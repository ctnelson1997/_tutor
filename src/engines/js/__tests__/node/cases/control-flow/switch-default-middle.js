// default clause in the middle (or first) of a switch, reached directly or by fall-through
function label(x) {
  let out = "";
  switch (x) {
    case 1:
      out += "one ";
    default:
      out += "other ";
    case 2:
      out += "two ";
      break;
    case 3:
      out += "three ";
  }
  return out.trim();
}
console.log(label(1));
console.log(label(2));
console.log(label(3));
console.log(label(9));

let hits = [];
for (const v of ["a", "b", "z"]) {
  switch (v) {
    default:
      hits.push("default:" + v);
      break;
    case "a":
      hits.push("a");
    case "b":
      hits.push("b");
  }
}
console.log(hits);
