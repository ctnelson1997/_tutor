# Abstract base class: abstract methods must be overridden; instantiating the ABC is a TypeError
from abc import ABC, abstractmethod

class Employee(ABC):
    def __init__(self, name):
        self.name = name

    @abstractmethod
    def pay(self):
        ...

    def payslip(self):
        return f"{self.name}: {self.pay()}"

class Salaried(Employee):
    def __init__(self, name, salary):
        super().__init__(name)
        self.salary = salary

    def pay(self):
        return self.salary // 12

class Hourly(Employee):
    def __init__(self, name, rate, hours):
        super().__init__(name)
        self.rate = rate
        self.hours = hours

    def pay(self):
        return self.rate * self.hours

class Lazy(Employee):
    pass

staff = [Salaried("Ann", 60000), Hourly("Bo", 20, 35)]
for e in staff:
    print(e.payslip())
for cls in (Employee, Lazy):
    try:
        cls("X")
    except TypeError as err:
        print("TypeError:", err)
