# A class-level counter gives each instance an id; the class attribute changes as objects are made
class Ticket:
    next_id = 1
    issued = []

    def __init__(self, event):
        self.id = Ticket.next_id
        Ticket.next_id += 1
        self.event = event
        Ticket.issued.append(self)

    def __repr__(self):
        return f"#{self.id} {self.event}"

    @classmethod
    def count(cls):
        return len(cls.issued)

t1 = Ticket("concert")
t2 = Ticket("game")
t3 = Ticket("concert")
print(t1, t2, t3)
print(Ticket.next_id, Ticket.count())
print([t.id for t in Ticket.issued if t.event == "concert"])
t2.next_id = 99          # instance attribute; the class counter is unchanged
t4 = Ticket("play")
print(t4, t2.next_id, Ticket.next_id)
