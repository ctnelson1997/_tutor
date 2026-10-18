// Typed arrays: Uint8 wraps modulo 256, Int8 signed wrap, Uint8Clamped rounds/clamps, Float32 precision, fixed length, numeric sort
const bytes = new Uint8Array(4);
bytes[0] = 255;
bytes[1] = 256;
bytes[2] = -1;
bytes[3] = 3.9;
console.log(bytes, bytes.length);
bytes[0]++;
console.log(bytes[0]);

const signed = new Int8Array([127, 128, -129, 200]);
console.log(signed);
const clamped = new Uint8ClampedArray([300, -5, 1.5, 2.5]);
console.log(clamped);

const f32 = new Float32Array([0.1, 1 / 3]);
console.log(f32[0], f32[0] === 0.1, f32[1]);

bytes[10] = 7;
console.log(bytes.length, bytes[10], Object.keys(bytes));

const fromArr = Uint8Array.from([1, 2, 3], (x) => x * 100);
console.log(fromArr, Array.from(fromArr), fromArr.map((x) => x * 2));
const total = fromArr.reduce((s, x) => s + x, 0);
console.log(total, Array.isArray(fromArr), fromArr instanceof Uint8Array);

const buffer = new ArrayBuffer(4);
const view8 = new Uint8Array(buffer);
const view32 = new Uint32Array(buffer);
view8[0] = 1;
view8[1] = 1;
console.log(view32[0], buffer.byteLength);
const sortedBytes = new Uint8Array([10, 9, 100, 1]).sort();
console.log(sortedBytes, [10, 9, 100, 1].sort());
