# escape sequences and non-ASCII text in output: \t, \\, \', \u00e9, \N{...}, CJK, emoji, len vs encoded size
s = "caf\u00e9"
alpha = "\N{GREEK SMALL LETTER ALPHA}"
cjk = "日本語"
emoji = "🐍"
print(s, alpha, cjk, emoji)
print(len(s), len(alpha), len(cjk), len(emoji))
print(len(s.encode("utf-8")), len(emoji.encode("utf-8")))
print(repr(s), repr(cjk), repr(emoji))
print(ascii(s), ascii(cjk), ascii(emoji))
print("back\\slash", 'single\'quote', "double\"quote")
print("bell-free \x41\x42 \101 \u0043")
path = r"C:\new\table"
print(path, len(path), repr(path))
combined = s + " " + emoji * 3
print(combined, combined.upper())
print(ord("é"), chr(233), hex(ord(emoji)))
print([s, cjk])
accented = "Ångström"
print(accented.lower(), accented.casefold(), accented[::-1])
print(f"{cjk:>6}|{emoji:^5}|")
