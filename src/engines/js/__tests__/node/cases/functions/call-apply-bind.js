// call, apply and bind: setting this, passing arguments, partial application, bound names and lengths
function introduce(greeting, punctuation) {
  return greeting + ', I am ' + this.name + punctuation;
}
const alice = { name: 'Alice' };
const bob = { name: 'Bob' };
console.log(introduce.call(alice, 'Hi', '!'));
console.log(introduce.apply(bob, ['Hello', '.']));
const aliceIntro = introduce.bind(alice);
const bobHey = introduce.bind(bob, 'Hey');
console.log(aliceIntro('Yo', '?'), bobHey('!!'));
console.log(aliceIntro.name, '|', bobHey.name, '|', introduce.length, bobHey.length);
const rebound = aliceIntro.bind(bob);
console.log('bind twice keeps the first this:', rebound('Hi', '.'));
console.log('call on a bound function:', aliceIntro.call(bob, 'Hi', '.'));
const numbers = [5, 1, 9, 3];
const biggest = Math.max.apply(null, numbers);
const smallest = Math.min.call(null, ...numbers);
console.log(biggest, smallest);
function sumAll() {
  return Array.prototype.reduce.call(arguments, (a, b) => a + b, 0);
}
console.log(sumAll(1, 2, 3, 4));
const double = function (x) { return x * this.factor; }.bind({ factor: 2 });
const doubled = [1, 2, 3].map(double);
console.log(doubled);
