# Strings as sequences: indexing, iteration, `in`, list()/tuple()/sorted(), join, immutability, unpacking, zip
word = "level"
print(word[0], word[-1], len(word), word == word[::-1])
letters = list(word)
print(letters, tuple("hi"), sorted("banana"))
vowels = 0
for ch in "education":
    if ch in "aeiou":
        vowels += 1
print(vowels, ch)
print("ell" in word, "x" not in word, "" in word)
letters[0] = "b"
print("".join(letters), word)
try:
    word[0] = "b"
except TypeError as e:
    print("TypeError:", e)
spaced = "-".join("abc")
print(spaced, "ab" * 3, "ab" + "cd")
print(list(enumerate("hey")), max("python"), min("python"))
chars = [c.upper() for c in "mix" if c != "i"]
print(chars, "mix".index("x"), "mississippi".count("ss"))
first, *others = "stack"
print(first, others)
pairs = list(zip("abc", "xyz"))
print(pairs, dict(zip("ab", "12")))
ords = [ord(c) for c in "AZaz"]
shifted = "".join(chr(o + 1) for o in ords)
print(ords, shifted)
emoji = "hi😀"
print(len(emoji), emoji[-1] == "😀", list(emoji))
