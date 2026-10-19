# A program that ends with ''' and holds raw strings, escaped quotes and backslashes
raw = r"\d+\s*"
print(raw, len(raw))
escaped = 'it\'s \\ fine'
print(escaped, len(escaped))
tail = '''the
end'''
print(tail.split())
last = '''x'''