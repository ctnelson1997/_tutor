# a mutable class attribute is shared by every instance; assigning through an instance shadows a class attribute until del
class Dog:
    tricks = []
    species = "canine"
    def __init__(self, name):
        self.name = name
    def add_trick(self, trick):
        self.tricks.append(trick)

rex = Dog("Rex")
fido = Dog("Fido")
rex.add_trick("roll")
fido.add_trick("sit")
print(rex.tricks, fido.tricks, Dog.tricks, rex.tricks is Dog.tricks)
rex.species = "wolf?"
print(rex.species, fido.species, Dog.species)
Dog.species = "Canis familiaris"
print(rex.species, fido.species)
del rex.species
print(rex.species)
print(sorted(vars(rex)), sorted(vars(fido)))
rex.tricks = ["own list"]
print(rex.tricks, fido.tricks, Dog.tricks)
