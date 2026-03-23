import type { CodeExample } from '../../types/engine';

export const examples: CodeExample[] = [
  {
    title: 'Variables & Types',
    slug: 'variables-types',
    category: 'Basics',
    language: 'py',
    code: `x = 42
name = "hello"
is_valid = True
pi = 3.14
print(x)`,
  },
  {
    title: 'For Loop',
    slug: 'for-loop',
    category: 'Basics',
    language: 'py',
    code: `total = 0
for i in range(5):
    total += i
print(total)`,
  },
  {
    title: 'While Loop',
    slug: 'while-loop',
    category: 'Basics',
    language: 'py',
    code: `count = 0
while count < 3:
    print(count)
    count += 1`,
  },
  {
    title: 'Lists',
    slug: 'lists',
    category: 'Data Structures',
    language: 'py',
    code: `nums = [1, 2, 3]
nums.append(4)
first = nums[0]
length = len(nums)
print(nums)`,
  },
  {
    title: 'Dictionaries',
    slug: 'dictionaries',
    category: 'Data Structures',
    language: 'py',
    code: `person = {"name": "Alice", "age": 30}
person["city"] = "NYC"
name = person["name"]
print(name)`,
  },
  {
    title: 'Tuples & Sets',
    slug: 'tuples-sets',
    category: 'Data Structures',
    language: 'py',
    code: `point = (3, 4)
x, y = point
colors = {"red", "green", "blue"}
colors.add("yellow")
print(x, y)`,
  },
  {
    title: 'Functions',
    slug: 'functions',
    category: 'Functions',
    language: 'py',
    code: `def greet(name):
    message = "Hello, " + name
    return message

result = greet("Alice")
print(result)`,
  },
  {
    title: 'Recursion',
    slug: 'recursion',
    category: 'Functions',
    language: 'py',
    code: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(4)
print(result)`,
  },
  {
    title: 'Classes',
    slug: 'classes',
    category: 'Objects',
    language: 'py',
    code: `class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def bark(self):
        return self.name + " says woof!"

rex = Dog("Rex", 5)
msg = rex.bark()
print(msg)`,
  },
  {
    title: 'Nested Data',
    slug: 'nested-data',
    category: 'Data Structures',
    language: 'py',
    code: `students = [
    {"name": "Alice", "grades": [90, 85]},
    {"name": "Bob", "grades": [78, 92]},
]
top = students[0]
print(top["name"])`,
  },
  {
    title: 'List Comprehension',
    slug: 'list-comprehension',
    category: 'Data Structures',
    language: 'py',
    code: `nums = [1, 2, 3, 4, 5]
squares = [x * x for x in nums]
evens = [x for x in nums if x % 2 == 0]
print(squares)
print(evens)`,
  },
];
