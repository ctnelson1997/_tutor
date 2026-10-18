// integers past Number.MAX_SAFE_INTEGER lose precision: MAX_SAFE_INTEGER + 2, counting past it, parsing big ids
const max = Number.MAX_SAFE_INTEGER;
const plusOne = max + 1;
const plusTwo = max + 2;
const plusThree = max + 3;
console.log(max, plusOne, plusTwo, plusThree);
console.log('plusOne === plusTwo:', plusOne === plusTwo);
console.log('safe?', Number.isSafeInteger(max), Number.isSafeInteger(plusOne));
console.log('2 ** 53:', 2 ** 53, '2 ** 53 + 1:', 2 ** 53 + 1);
const min = Number.MIN_SAFE_INTEGER;
console.log(min, min - 2);
let counter = max - 2;
for (let i = 0; i < 4; i++) {
  counter++;
  console.log('counter', i, counter);
}
const big = 12345678901234567890;
console.log(big, String(big));
const parsed = parseInt('9007199254740993');
const fromJson = JSON.parse('{"id": 9007199254740993}').id;
console.log(parsed, fromJson, parsed === fromJson);
