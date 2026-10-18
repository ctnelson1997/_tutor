// async functions return promises; await unwraps return values from nested async calls
async function getNumber() {
  return 21;
}
async function doubleIt() {
  const n = await getNumber();
  const doubled = n * 2;
  return doubled;
}
async function main() {
  console.log("main start");
  const result = await doubleIt();
  console.log("result", result);
  const p = getNumber();
  console.log("is promise:", p instanceof Promise);
  const values = [await getNumber(), await doubleIt()];
  console.log(values);
  return "main done";
}
let finalMessage = "";
main().then((m) => {
  finalMessage = m;
  console.log(m);
});
console.log("after calling main (sync)");
