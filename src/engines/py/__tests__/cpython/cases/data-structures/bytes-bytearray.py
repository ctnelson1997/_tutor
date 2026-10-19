# bytes and bytearray: indexing gives ints, slicing gives bytes, encode/decode non-ASCII, bytearray mutation, hex
data = b"Hi!"
print(data, data[0], data[-1], data[0:2], list(data))
text = "café"
encoded = text.encode("utf-8")
print(encoded, len(text), len(encoded))
print(encoded.decode("utf-8"), encoded.hex(), bytes.fromhex("48 69"))
buf = bytearray(b"hello")
buf[0] = 74
buf.append(33)
buf.extend(b"?!")
print(buf, len(buf))
buf[1:3] = b"EE"
del buf[-1]
print(buf, buf.decode(), bytes(buf))
zeros = bytes(4)
counted = bytearray(range(65, 70))
print(zeros, counted, counted.lower())
print(b"ab" + b"cd", b"x" * 3, b"a" in b"cat", 97 in b"cat")
try:
    data[0] = 72
except TypeError as e:
    print("TypeError:", e)
try:
    buf.append(300)
except ValueError as e:
    print("ValueError:", e)
raw = bytes([0, 10, 127, 128, 255])
print(raw, raw.split(b"\x7f"), data == bytearray(b"Hi!"))
quote = b'it\'s "q"\\'
print(quote, len(quote))
