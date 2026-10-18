// A global regex's lastIndex makes test()/exec() stateful: alternating results, an exec loop, resets, sticky y
const hasDigit = /\d/g;
const inputs = ["a1", "b2", "c3", "d4"];
const results = inputs.map(s => {
  const ok = hasDigit.test(s);
  return `${s}:${ok}:${hasDigit.lastIndex}`;
});
console.log(results.join(" "));

const re = /o/g;
const word = "foo boo";
console.log(re.test(word), re.lastIndex, re.test(word), re.lastIndex);
console.log(re.test(word), re.lastIndex, re.test(word), re.lastIndex);
console.log(re.test(word), re.lastIndex);

const wordRe = /\b(\w)(\w*)\b/g;
const sentence = "make each word big";
const found = [];
let m;
while ((m = wordRe.exec(sentence)) !== null) {
  found.push(`${m[1].toUpperCase()}${m[2]}@${m.index}->${wordRe.lastIndex}`);
}
console.log(found.join(", "), wordRe.lastIndex);

const sticky = /\d+/y;
const data = "12 34";
const s1 = sticky.exec(data);
console.log(s1[0], sticky.lastIndex, sticky.exec(data), sticky.lastIndex);
sticky.lastIndex = 3;
console.log(sticky.exec(data)[0], sticky.lastIndex);

const fresh = () => /\d/g;
console.log(fresh().test("a1"), fresh().test("b2"), hasDigit.flags, re.global, sticky.sticky);
