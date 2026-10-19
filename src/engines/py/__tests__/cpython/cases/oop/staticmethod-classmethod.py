# @staticmethod helper, @classmethod alternative constructors, and cls in a subclass
class Date:
    def __init__(self, year, month, day):
        self.year = year
        self.month = month
        self.day = day

    @classmethod
    def from_string(cls, text):
        y, m, d = map(int, text.split("-"))
        return cls(y, m, d)

    @staticmethod
    def is_leap(year):
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

    def __repr__(self):
        return f"{type(self).__name__}({self.year}, {self.month}, {self.day})"

class Birthday(Date):
    pass

d = Date.from_string("2024-02-29")
b = Birthday.from_string("2001-07-04")
print(d, b)
print(Date.is_leap(2024), Date.is_leap(1900), d.is_leap(2000))
print(type(b).__name__, isinstance(b, Date))
leaps = [y for y in range(1996, 2010) if Date.is_leap(y)]
print(leaps)
