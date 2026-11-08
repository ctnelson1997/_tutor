// Sloppy-mode variables named yield, await and package, around a generator, an async function and a class (#90)
function outer() {
  var yield = 1;
  var await = 2;
  var package = 3;
  function* gen() {
    yield 4;
  }
  async function later() {
    return await Promise.resolve(5);
  }
  class Box {
    get size() {
      return 6;
    }
  }
  return [yield, await, package, ...gen(), new Box().size, typeof later];
}
console.log(outer());
