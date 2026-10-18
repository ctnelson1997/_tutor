// Class expressions: anonymous and named, mixin functions returning classes, classes stored in an object
const Shape = class {
  constructor(sides) {
    this.sides = sides;
  }
};
const Named = class Inner {
  whoAmI() {
    return Inner.name;
  }
};
console.log(Shape.name, Named.name, new Named().whoAmI(), typeof Inner);

function withTimestamps(Base) {
  return class extends Base {
    stamp = 1000;
    touch() {
      this.stamp += 1;
      return this;
    }
  };
}
const Serializable = (Base) =>
  class extends Base {
    serialize() {
      return JSON.stringify(this);
    }
  };

class Note {
  constructor(text) {
    this.text = text;
  }
}
const SmartNote = Serializable(withTimestamps(Note));
const note = new SmartNote('buy milk');
note.touch().touch();
console.log(note.serialize(), note instanceof Note, JSON.stringify(SmartNote.name));

const registry = {
  square: class extends Shape {
    constructor() {
      super(4);
    }
  },
  triangle: class extends Shape {
    constructor() {
      super(3);
    }
  },
};
const shapes = Object.entries(registry).map(([key, Cls]) => [key, new Cls().sides, Cls.name]);
console.log(shapes);
const sq = new registry.square();
console.log(note, sq);
