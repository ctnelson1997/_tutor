# Objects holding lists of other objects, with back references (a reference cycle) and aliasing
class Course:
    def __init__(self, code):
        self.code = code
        self.students = []

    def enroll(self, student):
        self.students.append(student)
        student.courses.append(self)

class Student:
    def __init__(self, name):
        self.name = name
        self.courses = []

cs = Course("CS220")
math = Course("MATH221")
ann = Student("Ann")
bo = Student("Bo")
cs.enroll(ann)
cs.enroll(bo)
math.enroll(ann)
print([s.name for s in cs.students])
print([c.code for c in ann.courses])
print(ann.courses[0].students[1].name)
best = cs.students[0]
best.name = "Annie"
print(math.students[0].name, best is ann)
cs.students.remove(bo)
print(len(cs.students), [c.code for c in bo.courses])
