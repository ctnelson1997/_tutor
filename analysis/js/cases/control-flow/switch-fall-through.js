// switch with grouped cases, deliberate fall-through, and no matching case
function daysIn(month) {
  switch (month) {
    case "feb":
      return 28;
    case "apr":
    case "jun":
    case "sep":
    case "nov":
      return 30;
    default:
      return 31;
  }
}
console.log(daysIn("feb"), daysIn("jun"), daysIn("jan"));

function perks(level) {
  const list = [];
  switch (level) {
    case 3:
      list.push("lounge");
    case 2:
      list.push("priority");
    case 1:
      list.push("snacks");
      break;
    case 0:
      list.push("nothing");
  }
  return list;
}
for (let lvl = 0; lvl <= 4; lvl++) {
  console.log(lvl, perks(lvl));
}
