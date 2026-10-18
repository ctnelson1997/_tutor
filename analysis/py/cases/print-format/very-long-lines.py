# very long output lines and long values held in variables (a 300-char string, a 100-element list)
dashes = "-" * 120
print(dashes)
csv = ",".join(map(str, range(100)))
print(csv)
print(len(csv))
squares = [i * i for i in range(100)]
print(squares)
sentence = "word " * 60
print(sentence.strip())
long_str = ("abcdefghijklmnopqrstuvwxyz" * 12)[:300]
print(long_str)
print(long_str[-26:])
nested = [[i] * 10 for i in range(8)]
print(nested)
big_dict = {i: str(i) * 3 for i in range(30)}
print(big_dict)
