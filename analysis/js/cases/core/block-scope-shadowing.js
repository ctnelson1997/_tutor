// nested blocks shadow outer let/const names (and a parameter); each block sees its own binding
let name = 'global';
const level = 0;
{
  let name = 'block 1';
  const level = 1;
  console.log(name, level);
  {
    let name = 'block 2';
    console.log(name, level);
    name = 'block 2 changed';
    console.log(name);
  }
  console.log(name);
}
console.log(name, level);

function shadowParam(name) {
  {
    let name = 'inner ' + level;
    console.log('inner block:', name);
  }
  return name;
}
console.log(shadowParam('param'));

let total = 0;
for (let running = 0, i = 1; i <= 3; i++) {
  let total = i * 10;
  running += total;
  console.log('iteration', i, 'block total', total, 'running', running);
}
console.log('outer total untouched:', total);

if (true) {
  const name = 'if block';
  var leaked = name + ' leaked via var';
}
console.log(leaked, name);
