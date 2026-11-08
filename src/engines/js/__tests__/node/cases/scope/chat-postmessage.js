// A chat exercise's own postMessage and addEventListener (#87): names a browser worker has
const inbox = [];
const handlers = {};
function addEventListener(type, fn) {
  (handlers[type] = handlers[type] || []).push(fn);
}
function postMessage(user, text) {
  inbox.push(user + ': ' + text);
  for (const fn of handlers.message || []) fn(user, text);
}
addEventListener('message', (user) => console.log('new message from', user));
postMessage('ana', 'hi');
postMessage('ben', 'hello');
console.log(inbox);
