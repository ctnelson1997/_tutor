# bisect: left vs right with duplicates, insort keeps a list sorted, counting a value, ranges, key= lookups
import bisect

scores = [10, 20, 20, 20, 30, 40]
print(bisect.bisect_left(scores, 20), bisect.bisect_right(scores, 20), bisect.bisect(scores, 25))
count_20 = bisect.bisect_right(scores, 20) - bisect.bisect_left(scores, 20)
print(count_20, bisect.bisect_left(scores, 5), bisect.bisect_left(scores, 99))
bisect.insort(scores, 25)
bisect.insort_left(scores, 20)
bisect.insort(scores, 0)
print(scores)


def contains(sorted_list, value):
    i = bisect.bisect_left(sorted_list, value)
    return i < len(sorted_list) and sorted_list[i] == value


print(contains(scores, 30), contains(scores, 35))
in_range = scores[bisect.bisect_left(scores, 15):bisect.bisect_right(scores, 30)]
print(in_range)
people = [("ann", 19), ("bo", 22), ("cy", 30)]
ages = [age for _, age in people]
pos = bisect.bisect(ages, 25)
people.insert(pos, ("di", 25))
print(pos, people)
idx = bisect.bisect_left(people, 22, key=lambda p: p[1])
print(idx, people[idx])
bisect.insort(people, ("ed", 20), key=lambda p: p[1])
print([name for name, _ in people])
words = ["apple", "fig", "kiwi", "plum"]
print(bisect.bisect(words, "grape"), bisect.bisect_left(words, "fig"))
