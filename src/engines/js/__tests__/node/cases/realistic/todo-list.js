// A todo-list manager: add, complete, remove, filter by status and summarize tasks
const todos = [];
let nextId = 1;

function addTodo(title, priority = "normal") {
  const todo = { id: nextId++, title, priority, done: false };
  todos.push(todo);
  return todo;
}

function completeTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.done = true;
  } else {
    console.log(`Todo ${id} not found`);
  }
}

function removeTodo(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index >= 0) {
    return todos.splice(index, 1)[0];
  }
  return null;
}

function listTodos(filter = "all") {
  const shown = todos.filter(t => {
    if (filter === "done") return t.done;
    if (filter === "open") return !t.done;
    return true;
  });
  console.log(`--- ${filter} (${shown.length}) ---`);
  shown.forEach(t => {
    const box = t.done ? "[x]" : "[ ]";
    const flag = t.priority === "high" ? " !" : "";
    console.log(`${box} ${t.id}. ${t.title}${flag}`);
  });
}

addTodo("Buy groceries");
addTodo("Finish lab 3", "high");
addTodo("Call grandma");
addTodo("Read chapter 5", "high");
completeTodo(1);
completeTodo(4);
completeTodo(9);
const removed = removeTodo(3);
console.log("Removed:", removed.title);
addTodo("Do laundry");
listTodos();
listTodos("open");
listTodos("done");
const summary = {
  total: todos.length,
  done: todos.filter(t => t.done).length,
  highPriorityOpen: todos.filter(t => t.priority === "high" && !t.done).map(t => t.title)
};
console.log(summary);
