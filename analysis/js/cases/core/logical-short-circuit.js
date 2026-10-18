// && || ?? return one of their operands and skip the right side; ||= &&= ??= and optional chaining
const calls = [];
function check(label, value) {
  calls.push(label);
  return value;
}
const r1 = check('a', 0) && check('b', 1);
const r2 = check('c', 'x') && check('d', 'y');
const r3 = check('e', '') || check('f', null);
const r4 = check('g', null) ?? check('h', 'default');
const r5 = check('i', 0) ?? check('j', 'unused');
console.log(r1, r2, r3, r4, r5);
console.log('calls:', calls.join(','));
const settings = { volume: 0, theme: '', name: null };
settings.volume ||= 50;
settings.theme ??= 'dark';
settings.name ??= 'guest';
settings.extra &&= 'never';
let score = 10;
score &&= score * 2;
console.log(settings, score, 'extra' in settings);
const user = { profile: { email: null } };
const email = (user.profile && user.profile.email) || 'no email';
const city = user.address?.city ?? 'unknown city';
const shout = user?.profile?.email?.toUpperCase();
const missingCall = user.greet?.();
console.log(email, city, shout, missingCall);
