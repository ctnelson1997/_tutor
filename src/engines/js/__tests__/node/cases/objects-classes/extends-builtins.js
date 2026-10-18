// Subclassing built-ins: a Stack extending Array (map returns a Stack), a custom Error with fields, a counting Map
class Stack extends Array {
  peek() {
    return this[this.length - 1];
  }
  get top() {
    return this.peek();
  }
}
const s = new Stack();
s.push(1, 2, 3);
console.log(s.peek(), s.length, s.top, Array.isArray(s), s instanceof Stack);
const doubled = s.map((x) => x * 2);
console.log(doubled instanceof Stack, doubled.peek(), doubled);

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
function check(user) {
  if (!user.email) throw new ValidationError('email', 'Email is required');
  return 'ok';
}
let failedField = null;
try {
  check({ name: 'x' });
} catch (e) {
  failedField = e.field;
  console.log(e.name, e.field, e.message, e instanceof ValidationError, e instanceof Error);
  console.log(String(e));
}
console.log(check({ email: 'a@b.c' }), failedField);

class CountingMap extends Map {
  increment(key) {
    this.set(key, (this.get(key) ?? 0) + 1);
    return this;
  }
}
const counts = new CountingMap();
for (const w of 'the cat and the hat and the bat'.split(' ')) counts.increment(w);
console.log([...counts], counts.size, counts instanceof Map);
console.log(counts, s);
