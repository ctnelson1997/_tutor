# Sorts student names and scores with selection sort, in ascending and descending order
def selection_sort(items, descending=False):
    arr = list(items)
    for i in range(len(arr)):
        best = i
        for j in range(i + 1, len(arr)):
            if descending:
                better = arr[j] > arr[best]
            else:
                better = arr[j] < arr[best]
            if better:
                best = j
        if best != i:
            arr[i], arr[best] = arr[best], arr[i]
    return arr


names = ["Maya", "Liam", "Zoe", "Ava", "Noah", "Ella", "Omar"]
scores = [88, 92, 75, 92, 60, 81]

sorted_names = selection_sort(names)
print("Names A-Z:", sorted_names)
high_to_low = selection_sort(scores, descending=True)
print("Scores high to low:", high_to_low)

pairs = list(zip(names, scores))
by_score = selection_sort([(s, n) for n, s in pairs], descending=True)
print("Ranking:")
rank = 1
for score, name in by_score:
    print(f"  {rank}. {name} ({score})")
    rank += 1
top_three = [name for _, name in by_score[:3]]
print("Top three:", top_three)
