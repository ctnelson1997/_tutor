// Checks which phrases are palindromes, ignoring case, spaces and punctuation
function cleanText(text) {
  let result = "";
  for (const ch of text.toLowerCase()) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      result += ch;
    }
  }
  return result;
}

function isPalindrome(text) {
  const cleaned = cleanText(text);
  let left = 0;
  let right = cleaned.length - 1;
  while (left < right) {
    if (cleaned[left] !== cleaned[right]) {
      return false;
    }
    left++;
    right--;
  }
  return true;
}

function isPalindromeShort(text) {
  const cleaned = cleanText(text);
  return cleaned === cleaned.split("").reverse().join("");
}

const phrases = ["racecar", "A man, a plan, a canal: Panama", "hello", "Never odd or even", "JavaScript"];
const results = {};
for (const phrase of phrases) {
  const answer = isPalindrome(phrase);
  results[phrase] = answer;
  console.log(`"${phrase}" -> ${answer ? "palindrome" : "not a palindrome"}`);
}
const agree = phrases.every(p => results[p] === isPalindromeShort(p));
console.log("Both methods agree:", agree);
const count = Object.values(results).filter(Boolean).length;
console.log(count + " palindromes found");
