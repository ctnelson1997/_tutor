# A 100,000-character string held in a variable (and a list containing it)
pattern = "abcde"
long_text = pattern * 20000
print(len(long_text))
print(long_text[:12], long_text[-3:])
print(long_text.count("cd"), long_text.find("ea"))
holder = [long_text, len(long_text)]
upper = long_text.upper()
print(upper[99995:], holder[1])
