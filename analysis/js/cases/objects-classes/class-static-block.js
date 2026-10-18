// static {} blocks run once at class definition, interleaved with static fields, and can reach private statics
console.log('before class');
class Config {
  static defaults = { retries: 3 };
  static #secret = 'abc123';
  static table;
  static {
    console.log('static block 1, retries =', Config.defaults.retries);
    Config.table = {};
    for (const code of ['a', 'b', 'c']) {
      Config.table[code] = code.charCodeAt(0);
    }
  }
  static derived = Object.keys(Config.table).length;
  static {
    console.log('static block 2, derived =', this.derived);
    Config.hint = Config.#secret.slice(0, 3);
  }
  static peek() {
    return Config.#secret.length;
  }
}
console.log('after class');
console.log(Config.table, Config.derived, Config.hint, Config.peek());

let leaked;
class Registry {
  static #items = [];
  static {
    leaked = (x) => Registry.#items.push(x);
  }
  static get size() {
    return Registry.#items.length;
  }
}
leaked('one');
leaked('two');
console.log(Registry.size, Object.keys(Config));
