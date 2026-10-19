# Encrypts and decrypts messages with a Caesar cipher, then cracks one by brute force
import string


def shift_char(ch, shift):
    if ch.isupper():
        base = ord("A")
    elif ch.islower():
        base = ord("a")
    else:
        return ch
    return chr((ord(ch) - base + shift) % 26 + base)


def encrypt(message, shift):
    return "".join(shift_char(ch, shift) for ch in message)


def decrypt(message, shift):
    result = ""
    for ch in message:
        result += shift_char(ch, -shift)
    return result


plain = "Meet at Noon!"
secret = encrypt(plain, 3)
print("Encrypted:", secret)
print("Decrypted:", decrypt(secret, 3))

wrapped = encrypt("xyz XYZ", 4)
print("Wrapped:", wrapped)

mystery = encrypt("hello", 7)
print("Mystery:", mystery)
found = None
key = 1
while key < 26 and found is None:
    attempt = decrypt(mystery, key)
    if attempt == "hello":
        found = (key, attempt)
    key += 1
print("Cracked:", found)

table = {letter: shift_char(letter, 13) for letter in string.ascii_lowercase[:6]}
print("ROT13 table start:", table)
print("ROT13 twice:", encrypt(encrypt("Hi", 13), 13) == "Hi")
