// Implements Stack and Queue classes and uses them to check brackets and serve a waiting line
class Stack {
  constructor() {
    this.items = [];
  }
  push(item) {
    this.items.push(item);
  }
  pop() {
    return this.items.pop();
  }
  peek() {
    return this.items[this.items.length - 1];
  }
  isEmpty() {
    return this.items.length === 0;
  }
}

class Queue {
  constructor() {
    this.items = [];
  }
  enqueue(item) {
    this.items.push(item);
  }
  dequeue() {
    return this.items.shift();
  }
  get size() {
    return this.items.length;
  }
}

function isBalanced(text) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = new Stack();
  for (const ch of text) {
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else if (ch in pairs) {
      if (stack.isEmpty() || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.isEmpty();
}

const tests = ["(a+b)*[c]", "{[()]}", "(]", "((x)", "f(g[1]{2})"];
for (const t of tests) {
  console.log(`${t} -> ${isBalanced(t) ? "balanced" : "unbalanced"}`);
}

const history = new Stack();
["home", "about", "contact"].forEach(page => history.push(page));
const back = history.pop();
console.log("Went back from", back, "to", history.peek());

const line = new Queue();
["Ana", "Bo", "Cy", "Di"].forEach(name => line.enqueue(name));
const served = [];
while (line.size > 2) {
  served.push(line.dequeue());
}
line.enqueue("Ed");
console.log("Served:", served);
console.log("Still waiting:", line.items, "size", line.size);
