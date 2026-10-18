// async arrow functions: expression and block bodies, async IIFE, map + Promise.all, async reduce
const square = async (x) => x * x;
const addLater = async (a, b) => {
  await null;
  return a + b;
};
const nums = [1, 2, 3, 4];
let squares;
(async () => {
  const s = await square(5);
  console.log("square(5) =", s);
  console.log("addLater =", await addLater(2, 3));
  squares = await Promise.all(
    nums.map(async (n) => {
      const v = await square(n);
      return v + 1;
    })
  );
  console.log("squares + 1:", squares);
  const total = await nums.reduce(async (accP, n) => (await accP) + n, Promise.resolve(0));
  console.log("async reduce total:", total);
})();
console.log("IIFE started");
