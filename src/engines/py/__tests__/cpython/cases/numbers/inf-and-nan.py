# inf, -inf and nan held in variables and lists; nan != nan, yet [nan] == [nan] by identity
import math
pinf = float("inf")
ninf = -pinf
nan = float("nan")
print(pinf, ninf, nan)
print(repr(pinf), str(nan), f"{ninf:.2f}")
print(nan == nan, nan != nan, math.isnan(nan), math.isinf(ninf))
diff = pinf - pinf
overflow = 1e308 * 10
print(diff, overflow, overflow == pinf, pinf > 10 ** 400)
box = [nan, pinf, ninf, 1.0]
print(box)
print([nan] == [nan], nan in box, float("nan") in box)
print(max(1, nan), max(nan, 1), min(pinf, 5))
print(math.inf == pinf, -math.inf == ninf, pinf * 0)
data = {"best": ninf, "worst": pinf}
for score in [3, 7, 1]:
    data["best"] = max(data["best"], score)
    data["worst"] = min(data["worst"], score)
print(data)
