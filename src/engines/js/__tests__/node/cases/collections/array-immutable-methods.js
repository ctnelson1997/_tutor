// ES2023 copying methods (toSorted/toReversed/toSpliced/with) leave the original alone, turn holes into undefined
const original = [3, 1, 4, 1, 5, 9];
const sorted = original.toSorted();
const reversed = original.toReversed();
const spliced = original.toSpliced(1, 2, 'x');
const replaced = original.with(-1, 99);
console.log(original);
console.log(sorted, reversed, spliced, replaced);

const mutated = [...original];
const sortResult = mutated.sort((a, b) => a - b);
console.log(sortResult === mutated, sorted === original);

const sparse = [1, , 3];
console.log(sparse.toReversed(), sparse.with(1, 2), sparse.toSorted(), sparse);

try {
  original.with(10, 0);
} catch (e) {
  console.log(e.name);
}

const state = { todos: ['a', 'b', 'c'] };
const history = [state];
const next = { ...state, todos: state.todos.toSpliced(1, 1) };
history.push(next);
const third = { ...next, todos: next.todos.with(0, 'A') };
history.push(third);
console.log(history.map((s) => s.todos.join('')), state.todos);
console.log(Object.isFrozen(original), original.toSorted((a, b) => b - a).slice(0, 3));
