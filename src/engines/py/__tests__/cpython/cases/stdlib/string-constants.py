# The string module's constants and capwords, used in a Caesar cipher and a character classifier
import string

print(string.ascii_lowercase)
print(string.ascii_uppercase)
print(string.digits, string.hexdigits, string.octdigits)
print(string.punctuation)
print(repr(string.whitespace))
print(len(string.ascii_letters), len(string.printable))
print(string.capwords("the  quick brown fox"), "the  quick brown fox".title())

def caesar(text, shift):
    lower = string.ascii_lowercase
    upper = string.ascii_uppercase
    table = str.maketrans(lower + upper,
                          lower[shift:] + lower[:shift] + upper[shift:] + upper[:shift])
    return text.translate(table)

secret = caesar("Hello, World!", 3)
print(secret, caesar(secret, -3))
counts = {"letters": 0, "digits": 0, "punct": 0, "space": 0}
for ch in "Pi is 3.14, right?":
    if ch in string.ascii_letters:
        counts["letters"] += 1
    elif ch in string.digits:
        counts["digits"] += 1
    elif ch in string.punctuation:
        counts["punct"] += 1
    else:
        counts["space"] += 1
print(counts)
