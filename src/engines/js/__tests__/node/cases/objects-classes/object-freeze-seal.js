// Object.freeze/seal/preventExtensions: silent failures in a sloppy-mode script, and shallow freezing
const config = Object.freeze({ host: 'localhost', port: 8080, paths: ['/a'] });
config.port = 9999;
config.extra = true;
delete config.host;
config.paths.push('/b');
console.log(config);
console.log(Object.isFrozen(config), Object.isFrozen(config.paths));

const sealed = Object.seal({ x: 1, y: 2 });
sealed.x = 10;
sealed.z = 3;
delete sealed.y;
console.log(sealed, Object.isSealed(sealed));

const locked = Object.preventExtensions({ a: 1 });
locked.b = 2;
locked.a = 5;
delete locked.a;
console.log(locked, Object.isExtensible(locked));

function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (typeof v === 'object' && v !== null) deepFreeze(v);
  }
  return Object.freeze(o);
}
const settings = deepFreeze({ theme: { dark: true }, list: [1, 2] });
settings.theme.dark = false;
console.log(settings.theme.dark, Object.isFrozen(settings.list));

const frozenArr = Object.freeze([3, 1, 2]);
const sortedCopy = [...frozenArr].sort();
console.log(frozenArr, sortedCopy);
