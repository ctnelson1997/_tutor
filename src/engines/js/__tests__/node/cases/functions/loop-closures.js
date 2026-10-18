// closures created in for-of, while and forEach loops capture that iteration's variables (or one shared outer one)
const handlers = {};
for (const name of ['save', 'load', 'quit']) {
  handlers[name] = () => 'handling ' + name;
}
console.log(handlers.save(), handlers.quit());
const fromWhile = [];
let n = 0;
while (n < 3) {
  const captured = n * n;
  fromWhile.push(() => captured);
  n++;
}
console.log(fromWhile.map(f => f()));
const sharedWhile = [];
let m = 0;
while (m < 3) {
  sharedWhile.push(() => m);
  m++;
}
console.log('closures over the outer m:', sharedWhile.map(f => f()));
const adders = [];
[1, 2, 3].forEach((step, index) => {
  adders.push(x => x + step * 10 + index);
});
console.log(adders.map(add => add(0)));
const delayed = [];
for (var i = 0; i < 3; i++) {
  let j = i;
  delayed.push(function () { return 'var i=' + i + ', let j=' + j; });
}
console.log(delayed.map(f => f()));
const firstHandler = handlers.load;
console.log(firstHandler());
