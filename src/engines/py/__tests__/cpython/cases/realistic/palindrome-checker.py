# Checks phrases for palindromes two ways and reverses the words in each phrase
def clean(text):
    result = ""
    for ch in text:
        if ch.isalnum():
            result += ch.lower()
    return result


def is_palindrome_loop(text):
    s = clean(text)
    left = 0
    right = len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True


def is_palindrome_slice(text):
    s = clean(text)
    return s == s[::-1]


def reverse_words(sentence):
    words = sentence.split()
    reversed_words = []
    for i in range(len(words) - 1, -1, -1):
        reversed_words.append(words[i])
    return " ".join(reversed_words)


phrases = ["Racecar", "A man, a plan, a canal: Panama", "hello world", "Was it a car or a cat I saw?", "No lemon no melon"]
results = {}
for phrase in phrases:
    a = is_palindrome_loop(phrase)
    b = is_palindrome_slice(phrase)
    results[phrase] = a
    print(f"{phrase!r}: {a} {'(agree)' if a == b else '(DISAGREE)'}")

print()
for phrase in phrases[2:4]:
    print(reverse_words(phrase))

count = sum(1 for v in results.values() if v)
print(count, "of", len(phrases), "are palindromes")
