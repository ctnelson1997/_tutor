// an error's name, message and stack's first line (only) for thrown and built-in errors raised inside nested calls
function parseAge(text) {
  const n = Number(text);
  if (Number.isNaN(n)) {
    throw new TypeError('not a number: ' + text);
  }
  if (n < 0) {
    throw new RangeError(`age cannot be negative (${n})`);
  }
  return n;
}
function register(text) {
  return { age: parseAge(text) };
}
const firstLines = [];
for (const input of ['42', 'abc', '-3']) {
  try {
    const person = register(input);
    console.log('registered', person);
  } catch (e) {
    const firstLine = e.stack.split('\n')[0];
    firstLines.push(firstLine);
    console.log(e.name, '|', e.message, '|', firstLine);
  }
}
try {
  const config = null;
  config.port = 80;
} catch (e) {
  console.log(e.stack.split('\n')[0]);
}
try {
  (12.5).toFixed(500);
} catch (e) {
  console.log(e.stack.split('\n')[0]);
}
const custom = new Error('custom failure');
custom.name = 'ValidationError';
console.log(custom.stack.split('\n')[0], '|', String(custom));
console.log(firstLines.length, custom instanceof Error);
