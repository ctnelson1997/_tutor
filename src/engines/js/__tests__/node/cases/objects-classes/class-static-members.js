// Static methods and fields: a shared counter, a private static id, a factory using `new this`, inherited statics
class User {
  static count = 0;
  static roles = ['admin', 'guest'];
  static #nextId = 100;

  constructor(name, role = 'guest') {
    this.id = User.#nextId++;
    this.name = name;
    this.role = role;
    User.count++;
  }
  static fromString(text) {
    const [name, role] = text.split(':');
    return new this(name, role);
  }
  static compare(a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }
  describe() {
    return `#${this.id} ${this.name} (${this.role})`;
  }
}

const u1 = new User('zed');
const u2 = User.fromString('amy:admin');
const users = [u1, u2, new User('max')].sort(User.compare);
console.log(users.map((u) => u.describe()));
console.log(User.count, u1.count, Object.keys(User));

class Admin extends User {
  static level = 'super';
}
const ad = Admin.fromString('root:admin');
console.log(ad instanceof Admin, ad.describe(), Admin.count, User.count);
Admin.count = 0;
console.log(Admin.count, User.count, Object.hasOwn(Admin, 'count'), Object.keys(Admin));
console.log(User);
