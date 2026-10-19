# Instance attributes added after __init__, setattr/getattr/delattr, and per-object attribute sets
class Robot:
    def __init__(self, name):
        self.name = name

r1 = Robot("R2")
r2 = Robot("C3")
r1.battery = 80
r1.tools = ["drill"]
setattr(r2, "battery", 55)
print(r1.battery, r2.battery, r1.tools)
print(hasattr(r2, "tools"))
r1.tools.append("saw")
r1.battery -= 30
print(getattr(r1, "battery"), getattr(r2, "tools", []))
del r1.tools
print(hasattr(r1, "tools"))
for attr in ["speed", "color"]:
    setattr(r2, attr, len(attr))
print(r2.speed, r2.color)
try:
    print(r1.speed)
except AttributeError as e:
    print("AttributeError:", e)
delattr(r2, "battery")
print(sorted(vars(r2)))
