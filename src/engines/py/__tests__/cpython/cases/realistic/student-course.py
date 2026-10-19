# Enrolls Student objects in a Course with a capacity, a waitlist, and grade averages
class Student:
    def __init__(self, name, student_id):
        self.name = name
        self.student_id = student_id
        self.grades = {}

    def add_grade(self, course_code, grade):
        self.grades[course_code] = grade

    def gpa(self):
        if not self.grades:
            return 0.0
        return sum(self.grades.values()) / len(self.grades)

    def __repr__(self):
        return f"Student({self.name!r}, {self.student_id})"


class Course:
    def __init__(self, code, capacity):
        self.code = code
        self.capacity = capacity
        self.roster = []
        self.waitlist = []

    def enroll(self, student):
        if student in self.roster:
            return "already enrolled"
        if len(self.roster) < self.capacity:
            self.roster.append(student)
            return "enrolled"
        self.waitlist.append(student)
        return "waitlisted"

    def drop(self, student):
        self.roster.remove(student)
        if self.waitlist:
            self.roster.append(self.waitlist.pop(0))

    def average(self):
        grades = [s.grades[self.code] for s in self.roster if self.code in s.grades]
        return sum(grades) / len(grades) if grades else None


people = [Student("Ida", 101), Student("Jon", 102), Student("Kai", 103), Student("Lea", 104)]
cs101 = Course("CS101", 3)
for s in people:
    print(s.name, "->", cs101.enroll(s))
print(people[0].name, "->", cs101.enroll(people[0]))

cs101.drop(people[1])
print("Roster:", cs101.roster)
print("Waitlist:", cs101.waitlist)

for s, g in zip(cs101.roster, [3.7, 3.0, 4.0]):
    s.add_grade("CS101", g)
people[0].add_grade("MATH221", 3.3)
print("Course average:", round(cs101.average(), 2))
for s in people:
    print(f"{s.name}: GPA {s.gpa():.2f}, courses {sorted(s.grades)}")
