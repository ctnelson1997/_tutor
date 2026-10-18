# heapq (a priority queue of tuples, nlargest/nsmallest, heapify) and bisect (insort, grade lookup)
import heapq
import bisect

tasks = []
heapq.heappush(tasks, (3, "write tests"))
heapq.heappush(tasks, (1, "fix bug"))
heapq.heappush(tasks, (2, "review"))
heapq.heappush(tasks, (1, "deploy"))
print(tasks)
order = []
while tasks:
    priority, name = heapq.heappop(tasks)
    order.append(name)
print(order)
nums = [5, 1, 8, 3, 9, 2]
heapq.heapify(nums)
print(nums, nums[0])
print(heapq.nlargest(3, [5, 1, 8, 3, 9, 2]), heapq.nsmallest(2, ["pear", "fig", "apple"], key=len))

def grade(score, cutoffs=[60, 70, 80, 90], letters="FDCBA"):
    return letters[bisect.bisect(cutoffs, score)]

print([grade(s) for s in [33, 60, 77, 89, 90, 100]])
sorted_list = [10, 20, 30]
bisect.insort(sorted_list, 25)
bisect.insort(sorted_list, 5)
print(sorted_list, bisect.bisect_left(sorted_list, 20), bisect.bisect_right(sorted_list, 20))
