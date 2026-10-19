# The messages of common built-in errors, printed via except Exception as e: print(type(e).__name__, e)
class Pet:
    def __init__(self):
        self.name = "Rex"

grades = {"ann": 90}
nums = [1, 2, 3]
position = 1.0
pet = Pet()
attempts = [
    lambda: grades["bob"],
    lambda: nums[3],
    lambda: (1, 2)[-5],
    lambda: 10 / 0,
    lambda: 10 % 0,
    lambda: "age: " + 5,
    lambda: len(42),
    lambda: nums + (4,),
    lambda: int("twelve"),
    lambda: float("1.2.3"),
    lambda: pet.age,
    lambda: None.upper(),
    lambda: nums.push(4),
    lambda: undefined_name,
    lambda: "abc".index("z"),
    lambda: nums.remove(9),
    lambda: [].pop(),
    lambda: {}.popitem(),
    lambda: int(None),
    lambda: "x" * 2.5,
    lambda: iter(5),
    lambda: nums[position],
    lambda: sorted([3, "a"]),
]
for attempt in attempts:
    try:
        attempt()
    except Exception as e:
        print(type(e).__name__, e)
