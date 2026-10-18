# Reads "name, score" lines until done, skipping malformed lines, then prints a gradebook
gradebook = {}
skipped = []

while True:
    line = input("name, score (or done): ")
    if line == "done":
        break
    parts = line.split(",")
    if len(parts) != 2:
        skipped.append(line)
        continue
    name = parts[0].strip().title()
    try:
        score = int(parts[1])
    except ValueError:
        skipped.append(line)
        continue
    gradebook.setdefault(name, []).append(score)

print()
print("Gradebook")
for name in sorted(gradebook):
    scores = gradebook[name]
    avg = sum(scores) / len(scores)
    print(f"  {name:<8} {str(scores):<14} avg {avg:6.2f}")

if skipped:
    print("Skipped lines:", skipped)

all_scores = [s for scores in gradebook.values() for s in scores]
best_name = max(gradebook, key=lambda n: max(gradebook[n]))
print("Highest single score:", max(all_scores), "by", best_name)
print("Number of scores:", len(all_scores))
