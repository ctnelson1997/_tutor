// Subclasses overriding built-in methods, a getter for message, a static name getter (#88): drawing a step calls none of them
class LoggingMap extends Map {
  forEach(cb) {
    console.log('custom forEach called');
    super.forEach(cb);
  }
}
const m = new LoggingMap([['a', 1]]);
m.set('b', 2);
console.log(m.size);
class FieldError extends Error {
  constructor(field) {
    super();
    this.name = 'FieldError';
    this.field = field;
  }
  get message() {
    return 'bad field ' + this.field;
  }
}
const err = new FieldError('email');
console.log(err.message);
class Day extends Date {
  toISOString() {
    return 'day ' + this.getUTCDate();
  }
}
const d = new Day(Date.UTC(2020, 0, 15));
console.log(d.toISOString());
class Widget {
  static get name() {
    return 'computed name';
  }
}
const w = new Widget();
console.log(Widget.name, typeof w);
