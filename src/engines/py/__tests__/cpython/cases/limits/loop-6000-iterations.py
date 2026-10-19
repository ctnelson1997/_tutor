# A loop of 6,000 iterations (more than the visualizer's 5,000-step cap), then prints the results
total = 0
evens = 0
for i in range(6000):
    total += i
    if i % 2 == 0:
        evens += 1
print("total:", total)
print("evens:", evens)
print("done")
