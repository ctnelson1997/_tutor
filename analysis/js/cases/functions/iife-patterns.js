// immediately invoked function expressions: plain, arrow, with arguments, the module pattern (with a getter), ! and void forms
const result = (function () {
  const secret = 'hidden';
  return secret.length;
})();
console.log(result, typeof secret);
const sum = ((a, b) => a + b)(3, 4);
console.log(sum);
const counterModule = (function () {
  let count = 0;
  function change(by) {
    count += by;
    return count;
  }
  return {
    up: () => change(1),
    down: () => change(-1),
    get value() {
      return count;
    },
  };
})();
counterModule.up();
counterModule.up();
counterModule.down();
console.log('module value:', counterModule.value);
const config = (function (env) {
  return { env, debug: env !== 'production' };
})('test');
console.log(config);
!function () {
  console.log('bang IIFE ran');
}();
void (function named() {
  console.log('void IIFE named', named.name);
})();
const squares = (function build(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(i * i);
  return out;
})(5);
console.log(squares);
