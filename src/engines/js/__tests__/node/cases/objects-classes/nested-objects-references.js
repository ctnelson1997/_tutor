// Nested objects share references: aliasing, a shallow spread copy, and reassigning a parameter vs mutating it
const school = {
  name: 'Lincoln',
  address: { street: '1 Main', city: 'Springfield' },
  classes: [{ title: 'Math', students: ['Al', 'Bea'] }],
};

const alias = school;
alias.name = 'Lincoln High';
console.log(school.name);

const shallow = { ...school };
shallow.name = 'Copy';
shallow.address.city = 'Shelbyville';
console.log(school.name, school.address.city);

const cls = school.classes[0];
cls.students.push('Cal');
console.log(school.classes[0].students);

function rename(obj, newName) {
  obj.name = newName;
  obj = { name: 'replaced' };
  return obj;
}
const ret = rename(school, 'Renamed');
console.log(school.name, ret.name);

school.address = { street: '2 Oak', city: 'Capital City' };
console.log(shallow.address.city, school.address.city);

const sameShape1 = { a: 1 };
const sameShape2 = { a: 1 };
console.log(sameShape1 === sameShape2, JSON.stringify(sameShape1) === JSON.stringify(sameShape2));
console.log(school);
