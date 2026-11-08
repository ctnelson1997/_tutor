// A Proxy whose traps log (#88): the console and the drawing show its target, running no trap
const target = { a: 1, b: 2 };
const p = new Proxy(target, {
  get(t, k) {
    console.log('get', String(k));
    return t[k];
  },
  set(t, k, v) {
    console.log('set', String(k), v);
    t[k] = v;
    return true;
  },
});
console.log(p.a);
p.c = 3;
console.log(p);
console.log(Object.keys(target));
