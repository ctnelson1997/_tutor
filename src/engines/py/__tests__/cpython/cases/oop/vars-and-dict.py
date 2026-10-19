# vars(obj) and obj.__dict__ printed; writing through __dict__; class __dict__ keys
class Book:
    genre = "fiction"

    def __init__(self, title, pages):
        self.title = title
        self.pages = pages

b = Book("Dune", 412)
print(vars(b))
print(b.__dict__)
print(vars(b) is b.__dict__)
b.__dict__["rating"] = 5
print(b.rating, vars(b))
b.pages += 8
info = dict(vars(b))
info["title"] = "changed copy"
print(b.title, info)
print("genre" in vars(b), "genre" in vars(Book))
print([k for k in vars(Book) if not k.startswith("__")])
