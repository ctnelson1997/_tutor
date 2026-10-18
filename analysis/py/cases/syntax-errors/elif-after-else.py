# Syntax error: an elif placed after the else branch of an if statement
score = 72
print("score:", score)
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
else:
    grade = "F"
elif score >= 70:
    grade = "C"
print("grade:", grade)
