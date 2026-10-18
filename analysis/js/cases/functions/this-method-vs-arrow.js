// this in object methods vs arrows defined inside methods vs plain nested functions vs borrowed methods
const timer = {
  seconds: 0,
  name: 'timer',
  tick() {
    this.seconds++;
    return this.seconds;
  },
  tickTwiceWithArrow() {
    const step = () => {
      this.seconds += 1;
      return this.name;
    };
    step();
    return step();
  },
  nestedFunction() {
    function inner() {
      return this === globalThis;
    }
    return inner();
  },
  savedSelf() {
    const self = this;
    function inner() {
      return self.name + ' via self';
    }
    return inner();
  },
  makeArrowGetter() {
    return () => this.seconds;
  },
};
console.log(timer.tick(), timer.tick());
console.log(timer.tickTwiceWithArrow(), timer.seconds);
console.log('inner function this is globalThis:', timer.nestedFunction());
console.log(timer.savedSelf());
const getSeconds = timer.makeArrowGetter();
timer.seconds = 100;
console.log('arrow keeps this:', getSeconds());
const other = { seconds: -1, getSeconds };
console.log('arrow ignores new owner:', other.getSeconds());
const shared = { name: 'shared', tick: timer.tick, seconds: 10 };
console.log('borrowed method uses its new this:', shared.tick(), shared.seconds, timer.seconds);
