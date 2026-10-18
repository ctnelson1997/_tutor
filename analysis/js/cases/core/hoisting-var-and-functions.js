// var and function declarations are hoisted: a var reads as undefined before its line, a function is callable early
console.log('before:', typeof count, count);
console.log('square(4) before its declaration:', square(4));
var count = 3;
console.log('after:', count);

function square(n) {
  return n * n;
}

console.log('typeof later before assignment:', typeof later);
var later = function () { return 'later'; };
console.log('typeof later after:', typeof later, later());

function shadow() {
  console.log('inner x before its var:', x);
  var x = 'inner';
  return x;
}
var x = 'outer';
console.log(shadow(), x);

var count = count + 1; // redeclaring a var is allowed
console.log('redeclared count:', count);
var total = square(count);
console.log('total:', total);
