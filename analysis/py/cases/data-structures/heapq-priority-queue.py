# heapq: the heap list after each push/pop, max-heap by negation, heapreplace/heappushpop, tuples, merge
import heapq

heap = []
for n in [5, 3, 8, 1, 9, 2]:
    heapq.heappush(heap, n)
    print(heap)
smallest = heapq.heappop(heap)
print(smallest, heap)
replaced = heapq.heapreplace(heap, 7)
print(replaced, heap)
pushed_popped = heapq.heappushpop(heap, 0)
print(pushed_popped, heap)
max_heap = []
for n in [4, 10, 6]:
    heapq.heappush(max_heap, -n)
biggest = -heapq.heappop(max_heap)
print(biggest, max_heap)
jobs = [(2, "email"), (1, "build"), (2, "deploy"), (0, "coffee")]
heapq.heapify(jobs)
print(jobs[0], jobs)
done = [heapq.heappop(jobs)[1] for _ in range(len(jobs))]
print(done, jobs)
merged = list(heapq.merge([1, 4, 9], [2, 3, 10], [5]))
print(merged)
print(heapq.nsmallest(2, [7, 1, 5, 1]), heapq.nlargest(1, [(1, "a"), (3, "b"), (2, "c")]))
