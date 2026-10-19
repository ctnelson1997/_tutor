# A program whose last character is a backslash, in a comment: the source reaches Python as data
path = "C:\\Users\\ada"
print(path)
print(len(path), path.count("\\"))
parts = path.split("\\")
print(parts)
# saved under C:\