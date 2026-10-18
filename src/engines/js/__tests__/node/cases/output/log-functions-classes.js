// console.log of functions, arrow functions, classes, and class instances (including subclasses and getters)
function greet(name) {
  return "hi " + name;
}
const add = (a, b) => a + b;
const anon = [function () {}, () => {}][0];
class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return this.name + " makes a sound";
  }
}
class Dog extends Animal {
  #secret = "bone";
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }
  get loud() {
    return this.name.toUpperCase();
  }
}
const rex = new Dog("Rex", "lab");
const pet = new Animal("Cat");
console.log(greet, add, anon);
console.log(Animal, Dog);
console.log(pet, rex);
console.log([pet, rex], { owner: "Sam", pet: rex });
console.log(rex.speak(), rex.loud, rex instanceof Animal);
console.log(Math.max, Array.prototype.push, async function load() {}, function* gen() {});
console.log({ method() {}, arrow: () => 1 });
