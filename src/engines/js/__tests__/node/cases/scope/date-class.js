// A program's own class named like a built-in the runtime uses (#87): the "write a Date class" exercise
class Date {
  constructor(day, month, year) {
    this.day = day;
    this.month = month;
    this.year = year;
  }
  toString() {
    return this.month + '/' + this.day + '/' + this.year;
  }
}
const independence = new Date(4, 7, 1776);
console.log(independence.year, String(independence));
console.log(independence);
