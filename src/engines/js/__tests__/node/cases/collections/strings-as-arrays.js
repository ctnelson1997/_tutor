// Strings as arrays: indexing, silent write failure (immutable), split vs spread with an emoji, Array methods via call
const word = 'hello';
console.log(word[0], word.at(-1), word.length, word[10]);
word[0] = 'J';
console.log(word);
const fixed = 'J' + word.slice(1);
console.log(fixed);

const chars = word.split('');
chars[0] = 'j';
console.log(chars, chars.join(''));
console.log([...word].reverse().join(''));

const emoji = 'hi👋!';
console.log(emoji.length, emoji.split('').length, [...emoji].length, Array.from(emoji));
console.log(emoji[2] === '👋', [...emoji][2] === '👋');

const vowels = Array.prototype.filter.call('education', (ch) => 'aeiou'.includes(ch));
console.log(vowels);
const upper = Array.prototype.map.call('abc', (ch) => ch.toUpperCase());
console.log(upper);

let count = 0;
for (const ch of 'banana') {
  if (ch === 'a') count++;
}
console.log(count);
const indexes = [];
for (let i = 0; i < word.length; i++) {
  if (word[i] === 'l') indexes.push(i);
}
console.log(indexes, 'a-b-c'.split('-', 2), 'abc'.split(), ''.split(''));
const sortedLetters = [...'banana'].sort().join('');
console.log(sortedLetters, Object.keys('abc'), typeof word, word);
