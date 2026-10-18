// a Promise executor runs synchronously, logging before and after resolve(); .then runs only after the script ends
const order = [];
console.log("1: before new Promise");
const p = new Promise((resolve) => {
  order.push("executor start");
  console.log("2: executor before resolve");
  resolve("first");
  console.log("3: executor after resolve (still runs)");
  resolve("second (ignored)");
  order.push("executor end");
});
console.log("4: after new Promise");
p.then((v) => {
  order.push("then " + v);
  console.log("6: then got", v);
  console.log(order);
});
console.log("5: end of script");
