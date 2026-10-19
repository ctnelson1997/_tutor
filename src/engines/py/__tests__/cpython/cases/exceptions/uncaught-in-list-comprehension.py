# ends uncaught: a ZeroDivisionError raised inside a list comprehension inside a function
def rates(distances, times):
    return [d / t for d, t in zip(distances, times)]

def summary(trips):
    dist = [t[0] for t in trips]
    time = [t[1] for t in trips]
    speeds = rates(dist, time)
    return max(speeds)

trips = [(10, 2), (30, 3), (8, 4)]
print(summary(trips))
trips.append((5, 0))
fastest = summary(trips)
print("never printed", fastest)
