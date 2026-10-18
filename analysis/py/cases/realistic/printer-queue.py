# Simulates a printer job queue with a Queue class and tracks wait times
class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, item):
        self.items.append(item)

    def dequeue(self):
        return self.items.pop(0)

    def is_empty(self):
        return not self.items

    def __len__(self):
        return len(self.items)


class Job:
    def __init__(self, name, pages, arrival):
        self.name = name
        self.pages = pages
        self.arrival = arrival

    def __repr__(self):
        return f"Job({self.name}, {self.pages}p)"


PAGES_PER_MINUTE = 2
jobs = [Job("essay", 4, 0), Job("photo", 1, 1), Job("thesis", 10, 2), Job("memo", 2, 3)]

queue = Queue()
for job in jobs:
    queue.enqueue(job)
print("Queued:", queue.items, "length", len(queue))

clock = 0
waits = {}
while not queue.is_empty():
    job = queue.dequeue()
    start = max(clock, job.arrival)
    duration = (job.pages + PAGES_PER_MINUTE - 1) // PAGES_PER_MINUTE
    clock = start + duration
    waits[job.name] = start - job.arrival
    print(f"t={start:>2}: printing {job.name} ({duration} min), done at t={clock}")

print("Waits:", waits)
average_wait = sum(waits.values()) / len(waits)
print("Average wait:", average_wait)
print("Queue empty:", queue.is_empty())
