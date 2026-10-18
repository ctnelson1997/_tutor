// console.log of null, undefined, -0, NaN, Infinity on their own and inside arrays and objects
const nothing = null;
let notSet;
const negZero = -0;
const notANumber = 0 / 0;
const values = [null, undefined, -0, 0, NaN, Infinity, -Infinity];
const record = { a: null, b: undefined, c: -0, d: NaN, e: -Infinity };
console.log(nothing, notSet);
console.log(negZero, 0, -0 === 0, Object.is(negZero, 0));
console.log(notANumber, typeof notANumber, Number.isNaN(notANumber));
console.log(1 / 0, -1 / 0, 1 / negZero);
console.log(values);
console.log(record);
console.log(String(-0), `${-0}`, -0 + "", JSON.stringify(-0));
console.log([undefined, , null]);
console.log(void 0, Number.MAX_SAFE_INTEGER, Number.EPSILON, 0.1 + 0.2);
