// Encrypts and decrypts messages with a Caesar cipher, keeping case and punctuation
function shiftChar(ch, shift) {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(((code - 65 + shift) % 26 + 26) % 26 + 65);
  }
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(((code - 97 + shift) % 26 + 26) % 26 + 97);
  }
  return ch;
}

function encrypt(message, shift) {
  let result = "";
  for (let i = 0; i < message.length; i++) {
    result += shiftChar(message.charAt(i), shift);
  }
  return result;
}

function decrypt(message, shift) {
  return encrypt(message, -shift);
}

const secret = "Meet me at Noon!";
const key = 3;
const encrypted = encrypt(secret, key);
const decrypted = decrypt(encrypted, key);
console.log("Original: ", secret);
console.log("Encrypted:", encrypted);
console.log("Decrypted:", decrypted);
const rot13 = encrypt("Hello, World", 13);
console.log("ROT13:", rot13, "->", encrypt(rot13, 13));
const roundTrip = decrypted === secret;
console.log("Round trip ok?", roundTrip);
