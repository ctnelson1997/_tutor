// Object literal shorthand properties, computed keys (with side effects) and method shorthand
const name = 'Ada';
const age = 36;
const field = 'lang';
let counter = 0;
const nextKey = () => 'k' + ++counter;

const person = {
  name,
  age,
  [field]: 'JS',
  [field + 'Version']: 2024,
  [nextKey()]: 'first',
  [nextKey()]: 'second',
  greet() {
    return 'Hi, I am ' + this.name;
  },
  'full name': 'Ada Lovelace',
  birthday: function () {
    this.age++;
    return this.age;
  },
};

console.log(person.greet());
console.log(person.lang, person.langVersion, person.k1, person.k2, counter);
console.log(person['full name']);
console.log(person.birthday(), person.age, age);
console.log(Object.keys(person));
console.log(typeof person.greet, person.greet.name, person.birthday.name);
const key = 'age';
person[key] += 10;
console.log(person[key]);
