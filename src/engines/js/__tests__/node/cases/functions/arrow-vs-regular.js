// arrows vs regular functions: no own this or arguments, not constructible (caught), no prototype, {} body vs ({})
function Regular() {
  this.made = true;
}
const Arrow = () => {};
console.log('prototype:', typeof Regular.prototype, typeof Arrow.prototype);
const r = new Regular();
console.log(r.made);
try {
  new Arrow();
} catch (e) {
  console.log(e.name + ':', e.message);
}
const obj = {
  value: 42,
  regular: function () { return this.value; },
  arrowInside() {
    const get = () => this.value;
    return get();
  },
  argsRegular: function () { return arguments.length; },
  argsArrowInside(a, b, c) {
    const count = () => arguments.length;
    return count(1, 2, 3, 4);
  },
};
console.log(obj.regular(), obj.arrowInside(), obj.argsRegular(1, 2), obj.argsArrowInside(1));
const objectReturn = () => ({ wrapped: true });
const blockReturn = () => { wrapped: true };
console.log(objectReturn(), blockReturn());
const holder = {
  label: 'holder',
  make() {
    return { label: 'inner', read: () => this.label };
  },
};
const made = holder.make();
console.log('arrow property reads the enclosing method this:', made.read());
