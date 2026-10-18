// extends/super across three levels: super() in constructors, an implicit constructor, super.method() chains, instanceof
class Animal {
  constructor(name, sound = '...') {
    this.name = name;
    this.sound = sound;
  }
  speak() {
    return `${this.name} says ${this.sound}`;
  }
  describe() {
    return `I am ${this.name}`;
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name, 'woof');
    this.breed = breed;
  }
  speak() {
    return super.speak() + '!';
  }
  describe() {
    return `${super.describe()}, a ${this.breed}`;
  }
}

class Puppy extends Dog {
  speak() {
    return super.speak().toUpperCase();
  }
}

const animals = [new Animal('Generic'), new Dog('Rex', 'beagle'), new Puppy('Bit', 'pug')];
for (const a of animals) {
  console.log(a.speak(), '|', a.describe());
}
const p = animals[2];
console.log(p instanceof Puppy, p instanceof Dog, p instanceof Animal, animals[1] instanceof Puppy);
console.log(Object.keys(p), p.constructor.name);
console.log(Object.getPrototypeOf(Puppy) === Dog, Object.getPrototypeOf(Puppy.prototype) === Dog.prototype);
console.log(animals);
