# @dataclass(order=True) sorts by field order; frozen=True refuses assignment and is hashable
from dataclasses import dataclass, FrozenInstanceError, replace

@dataclass(order=True)
class Version:
    major: int
    minor: int
    patch: int = 0

@dataclass(frozen=True)
class Coord:
    lat: float
    lon: float

versions = [Version(1, 10), Version(1, 2, 5), Version(0, 9, 9), Version(1, 2)]
print(sorted(versions))
print(max(versions), Version(1, 2) < Version(1, 2, 1))

home = Coord(43.07, -89.40)
try:
    home.lat = 0
except FrozenInstanceError as e:
    print("FrozenInstanceError:", e)
moved = replace(home, lon=-89.0)
print(home, moved)
visited = {home, Coord(43.07, -89.40), moved}
print(len(visited))
