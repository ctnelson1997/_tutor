// Object.create prototype chains: inherited lookups, shadowing then deleting, for-in over inherited keys, shared arrays
const animal = {
  type: 'animal',
  legs: 4,
  tricks: [],
  describe() {
    return `${this.name} is a ${this.type} with ${this.legs} legs`;
  },
};

const bird = Object.create(animal);
bird.type = 'bird';
bird.legs = 2;
const tweety = Object.create(bird, { name: { value: 'Tweety', enumerable: true } });
const rex = Object.create(animal);
rex.name = 'Rex';

console.log(tweety.describe());
console.log(rex.describe());
console.log(tweety.hasOwnProperty('type'), 'type' in tweety, Object.keys(tweety));

const inherited = [];
for (const key in tweety) inherited.push(key);
console.log(inherited);

tweety.tricks.push('sing');
rex.tricks.push('fetch');
console.log(animal.tricks, tweety.tricks === rex.tricks);

rex.legs = 3;
delete rex.legs;
console.log(rex.legs);
animal.legs = 6;
console.log(rex.legs, tweety.legs);
delete bird.legs;
console.log(tweety.legs);

console.log(Object.getPrototypeOf(tweety) === bird, animal.isPrototypeOf(tweety));
console.log(tweety, rex, bird);
