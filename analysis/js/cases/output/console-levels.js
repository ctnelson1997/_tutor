// console.error, warn, info and debug interleaved with console.log (stderr vs stdout, order kept)
const temps = [72, 105, 64, -5];
let warnings = 0;
let errors = 0;
console.info("Checking", temps.length, "readings");
for (const t of temps) {
  if (t > 100) {
    console.warn("High reading:", t);
    warnings++;
  } else if (t < 0) {
    console.error("Invalid reading:", t, { t });
    errors++;
  } else {
    console.log("ok", t);
  }
  console.debug("checked", t);
}
console.error(new Error("sensor offline").message);
console.warn("%s warning(s)", warnings);
console.info({ warnings, errors });
console.log("summary:", warnings, errors);
