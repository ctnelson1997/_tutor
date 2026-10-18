// Method chaining by returning `this`: a query builder class and an object-literal calculator with undo
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.conditions = [];
    this.order = null;
    this.max = null;
  }
  where(cond) {
    this.conditions.push(cond);
    return this;
  }
  orderBy(field, dir = 'ASC') {
    this.order = `${field} ${dir}`;
    return this;
  }
  limit(n) {
    this.max = n;
    return this;
  }
  build() {
    let sql = `SELECT * FROM ${this.table}`;
    if (this.conditions.length) sql += ' WHERE ' + this.conditions.join(' AND ');
    if (this.order) sql += ' ORDER BY ' + this.order;
    if (this.max !== null) sql += ' LIMIT ' + this.max;
    return sql;
  }
}

const q = new QueryBuilder('users').where('age > 18').where("country = 'US'").orderBy('name').limit(10);
console.log(q.build());
console.log(new QueryBuilder('logs').limit(0).build());

const calc = {
  value: 0,
  history: [],
  add(n) { this.history.push(this.value); this.value += n; return this; },
  times(n) { this.history.push(this.value); this.value *= n; return this; },
  undo() { this.value = this.history.pop() ?? 0; return this; },
};
const result = calc.add(5).times(3).add(1).undo().times(2).value;
console.log(result, calc.history);
const same = calc.add(1) === calc;
console.log(same, calc.value, q);
