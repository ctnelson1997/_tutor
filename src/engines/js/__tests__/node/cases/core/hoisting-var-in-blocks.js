// var declared inside if/for/while blocks belongs to the whole function (or script); let stays in its block
function describe(flag) {
  console.log('start: msg =', msg, 'i =', i, 'last =', last);
  if (flag) {
    var msg = 'flag was true';
  }
  for (var i = 0; i < 3; i++) {
    var last = i * 10;
  }
  console.log('after loop: i =', i, 'last =', last);
  return msg;
}
console.log(describe(true));
console.log(describe(false));

function letVersion() {
  if (true) {
    let hidden = 'block only';
    var visible = hidden.toUpperCase();
  }
  console.log(typeof hidden, visible);
  return visible;
}
const result = letVersion();

var j;
while ((j = (j || 0) + 1) < 4) {
  var squared = j * j;
}
console.log('j =', j, 'squared =', squared);
