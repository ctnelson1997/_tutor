// Converts temperatures between Celsius and Fahrenheit and prints a conversion table
function toFahrenheit(celsius) {
  return celsius * 9 / 5 + 32;
}

function toCelsius(fahrenheit) {
  return (fahrenheit - 32) * 5 / 9;
}

function describe(tempF) {
  if (tempF <= 32) return "freezing";
  if (tempF < 60) return "cold";
  if (tempF < 80) return "nice";
  return "hot";
}

function makeTable(start = 0, end = 40, step = 10) {
  const rows = [];
  for (let c = start; c <= end; c += step) {
    const f = toFahrenheit(c);
    rows.push({ c, f, feel: describe(f) });
  }
  return rows;
}

const table = makeTable(-10, 40);
for (const row of table) {
  console.log(`${row.c} C = ${row.f} F (${row.feel})`);
}

const readingsF = [98.6, 212, 32, -40, 70];
const readingsC = readingsF.map(f => Math.round(toCelsius(f) * 100) / 100);
console.log("Fahrenheit:", readingsF);
console.log("Celsius:", readingsC);
const defaultTable = makeTable();
console.log("Default table has " + defaultTable.length + " rows");
const hottest = Math.max(...readingsC);
console.log(`Hottest reading: ${hottest} C is ${describe(toFahrenheit(hottest))}`);
