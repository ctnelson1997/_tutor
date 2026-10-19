# re basics: search/match/fullmatch, groups and named groups, findall, finditer, sub with a function, split
import re

text = "Call 555-1234 or 555-9876; office: 608-555-0000. Email ann@wisc.edu, bo@example.com"
print(re.findall(r"\d{3}-\d{4}", text))
m = re.search(r"(\d{3})-(\d{3})-(\d{4})", text)
print(m.group(), m.group(1), m.groups(), m.start(), m.span())
print(re.match(r"\d+", text), re.match(r"Call", text).group())
print(bool(re.fullmatch(r"[A-Z][a-z]+", "Hello")), re.fullmatch(r"[A-Z][a-z]+", "Hello!"))
emails = re.findall(r"(\w+)@([\w.]+)", text)
print(emails)
for match in re.finditer(r"(?P<user>\w+)@(?P<host>\w+)", text):
    print(match["user"], match.group("host"), match.groupdict())
print(re.sub(r"\d", "#", "pin 4821"))
print(re.sub(r"(\w+)@", lambda mm: mm.group(1).upper() + "@", text[text.index("ann"):]))
print(re.split(r"[;,.]\s*", "a, b;c. d"))
word = re.compile(r"\b[a-z]{3}\b", re.IGNORECASE)
print(word.findall("The cat sat on THE mat"))
print(re.sub(r"\s+", " ", "too    many   spaces").strip())
