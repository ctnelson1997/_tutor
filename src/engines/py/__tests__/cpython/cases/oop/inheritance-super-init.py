# Inheritance with super().__init__, an extra subclass attribute and an overridden method
class Animal:
    def __init__(self, name, sound="..."):
        self.name = name
        self.sound = sound

    def speak(self):
        return f"{self.name} says {self.sound}"

class Cat(Animal):
    def __init__(self, name, indoor):
        super().__init__(name, "meow")
        self.indoor = indoor

    def speak(self):
        base = super().speak()
        return base + (" (from the couch)" if self.indoor else " (from outside)")

class Fish(Animal):
    pass

pets = [Cat("Tom", True), Cat("Felix", False), Fish("Nemo")]
for p in pets:
    print(p.speak())
tom = pets[0]
print(tom.name, tom.sound, tom.indoor)
print(isinstance(tom, Animal), isinstance(pets[2], Cat))
