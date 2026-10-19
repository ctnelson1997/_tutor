# A property whose getter raises: reading it is an error, hasattr() hides AttributeError only
class Sensor:
    def __init__(self, name):
        self.name = name
        self._reading = None

    @property
    def reading(self):
        if self._reading is None:
            raise AttributeError("sensor has no reading yet")
        return self._reading

    @property
    def ratio(self):
        return 100 / self._reading

s = Sensor("thermo")
print(hasattr(s, "reading"))
try:
    print(s.reading)
except AttributeError as e:
    print("AttributeError:", e)
s._reading = 0
print(hasattr(s, "reading"), s.reading)
try:
    print(s.ratio)
except ZeroDivisionError as e:
    print("ZeroDivisionError:", e)
s._reading = 8
print(s.reading, s.ratio)
