# Class attribute vs instance attribute, and shadowing a class attribute through self
class Dog:
    species = "Canis familiaris"
    legs = 4

    def __init__(self, name):
        self.name = name

    def lose_leg(self):
        self.legs = self.legs - 1   # creates an instance attribute that shadows Dog.legs

rex = Dog("Rex")
fido = Dog("Fido")
print(rex.species, rex.legs, fido.legs)
rex.lose_leg()
print(rex.legs, fido.legs, Dog.legs)
Dog.legs = 5
print(rex.legs, fido.legs, Dog.legs)
fido.species = "wolf"
print(fido.species, rex.species, Dog.species)
del fido.species
print(fido.species)
print("legs" in rex.__dict__, "legs" in fido.__dict__)
