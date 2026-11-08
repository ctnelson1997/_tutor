// A var declared in a block belongs to the whole function: it stays in its frame after the block (#93)
for (var i = 0; i < 2; i++) {
  var sq = i * i;
}
if (true) {
  var msg = 'hi';
}
function f() {
  if (true) {
    var inner = 'kept';
  }
  return inner;
}
console.log(sq, msg, f());
