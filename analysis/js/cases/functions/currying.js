// currying and partial application: curried arrows, a generic curry driven by fn.length, bind and a partial helper
const addThree = a => b => c => a + b + c;
console.log(addThree(1)(2)(3));
const add1 = addThree(1);
const add1and2 = add1(2);
console.log(add1and2(10), add1(5)(5));
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    }
    return (...more) => curried.apply(this, args.concat(more));
  };
}
function volume(l, w, h) {
  return l * w * h;
}
const curriedVolume = curry(volume);
console.log(curriedVolume(2)(3)(4), curriedVolume(2, 3)(4), curriedVolume(2)(3, 4), curriedVolume(2, 3, 4));
const format = curry((prefix, suffix, text) => prefix + text + suffix);
const bracket = format('[', ']');
const tags = ['a', 'b'].map(t => bracket(t));
console.log(tags);
function greet(greeting, name) {
  return `${greeting}, ${name}`;
}
const hello = greet.bind(null, 'Hello');
console.log(hello('Ana'), hello.length);
const partial = (fn, ...preset) => (...later) => fn(...preset, ...later);
const sayHi = partial(greet, 'Hi');
console.log(sayHi('Ben'));
