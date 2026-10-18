// function declarations inside blocks (sloppy mode, Annex B): hoisted within the block, visible outside once it ran
console.log('before the block:', typeof helper);
{
  console.log('inside, before its line:', helper());
  function helper() {
    return 'helper result';
  }
}
console.log('after the block:', typeof helper, helper());
function choose(flag) {
  if (flag) {
    function pick() { return 'first'; }
  } else {
    function pick() { return 'second'; }
  }
  return pick();
}
console.log(choose(true), choose(false));
function notRun() {
  if (false) {
    function never() { return 'never'; }
  }
  return typeof never;
}
console.log('declared in a block that never ran:', notRun());
const results = [];
for (let i = 0; i < 2; i++) {
  function label() { return 'loop ' + i; }
  results.push(label());
}
console.log(results);
