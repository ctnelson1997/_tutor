import type { CodeExample } from '../../types/engine';

export const examples: CodeExample[] = [
  // ── Basics ──
  {
    title: 'Variables & Types',
    slug: 'variables-types',
    category: 'Basics',
    language: 'js',
    code: `let num = 42;
let str = "hello";
let bool = true;
let nothing = null;
let undef = undefined;
console.log(num, str, bool, nothing, undef);`,
  },
  {
    title: 'For Loop',
    slug: 'for-loop',
    category: 'Basics',
    language: 'js',
    code: `let sum = 0;
for (let i = 1; i <= 5; i++) {
  sum += i;
}
console.log("Sum:", sum);`,
  },
  {
    title: 'While Loop',
    slug: 'while-loop',
    category: 'Basics',
    language: 'js',
    code: `let n = 1;
while (n < 100) {
  n = n * 2;
}
console.log(n);`,
  },
  {
    title: 'Conditionals',
    slug: 'conditionals',
    category: 'Basics',
    language: 'js',
    code: `let age = 20;
let category;

if (age < 13) {
  category = "child";
} else if (age < 18) {
  category = "teenager";
} else {
  category = "adult";
}
console.log(category);`,
  },

  // ── Functions ──
  {
    title: 'Recursion (Factorial)',
    slug: 'recursion-factorial',
    category: 'Functions',
    language: 'js',
    code: `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

let result = factorial(5);
console.log("5! =", result);`,
  },
  {
    title: 'Closures',
    slug: 'closures',
    category: 'Functions',
    language: 'js',
    code: `function makeCounter() {
  let count = 0;
  return function increment() {
    count++;
    return count;
  };
}

let counter = makeCounter();
console.log(counter()); // 1
console.log(counter()); // 2
console.log(counter()); // 3`,
  },
  {
    title: 'Higher-Order Functions',
    slug: 'higher-order-functions',
    category: 'Functions',
    language: 'js',
    code: `let numbers = [1, 2, 3, 4, 5];

let tripled = numbers.map(function(n) {
  return n * 3;
});

let evens = tripled.filter(function(n) {
  return n % 2 === 0;
});

console.log("tripled:", tripled);
console.log("evens:", evens);`,
  },

  // ── Data Structures ──
  {
    title: 'Linked List',
    slug: 'linked-list',
    category: 'Data Structures',
    language: 'js',
    code: `function createNode(value, next) {
  return { value: value, next: next };
}

let list = null;
for (let i = 3; i >= 1; i--) {
  list = createNode(i, list);
}

// Traverse
let current = list;
while (current !== null) {
  console.log(current.value);
  current = current.next;
}`,
  },
  {
    title: 'Stack (Array)',
    slug: 'stack-array',
    category: 'Data Structures',
    language: 'js',
    code: `let stack = [];

stack.push(10);
stack.push(20);
stack.push(30);
console.log("Stack:", stack);

let top = stack.pop();
console.log("Popped:", top);
console.log("Stack now:", stack);`,
  },

  // ── Objects & Classes ──
  {
    title: 'Objects & Methods',
    slug: 'objects-methods',
    category: 'Objects & Classes',
    language: 'js',
    code: `let person = {
  name: "Alice",
  age: 25,
  greet: function() {
    return "Hi, I'm " + this.name;
  }
};

console.log(person.greet());
person.age = 26;
console.log(person.name, "is", person.age);`,
  },
  {
    title: 'Classes',
    slug: 'classes',
    category: 'Objects & Classes',
    language: 'js',
    code: `class Animal {
  constructor(name, sound) {
    this.name = name;
    this.sound = sound;
  }
  speak() {
    return this.name + " says " + this.sound;
  }
}

let cat = new Animal("Cat", "meow");
let dog = new Animal("Dog", "woof");
console.log(cat.speak());
console.log(dog.speak());`,
  },
];
