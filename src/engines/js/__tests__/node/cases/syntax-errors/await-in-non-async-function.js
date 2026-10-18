// syntax error: await used inside a function that is not declared async
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
let finished = false;
function run() {
  console.log("waiting");
  await delay(10);
  finished = true;
}
run();
