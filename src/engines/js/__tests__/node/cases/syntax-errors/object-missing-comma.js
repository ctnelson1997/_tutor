// syntax error: an object literal is missing a comma between two properties
const shelf = [];
const book = {
  title: "Dune",
  author: "Herbert"
  year: 1965,
};
shelf.push(book);
console.log(shelf);
