import java.util.ArrayList;
public class Main {
  static class Student {
    private String name;
    private double gpa;
    public Student(String name, double gpa) {
      this.name = name;
      this.gpa = gpa;
    }
    public String getName() { return name; }
    public double getGpa() { return gpa; }
    @Override
    public String toString() { return name + " (" + gpa + ")"; }
  }

  public static Student best(ArrayList<Student> roster) {
    Student top = roster.get(0);
    for (Student s : roster) {
      if (s.getGpa() > top.getGpa()) top = s;
    }
    return top;
  }

  public static void main(String[] args) {
    ArrayList<Student> roster = new ArrayList<>();
    roster.add(new Student("Avery", 3.4));
    roster.add(new Student("Blake", 3.9));
    roster.add(new Student("Casey", 2.8));
    double sum = 0;
    for (int i = 0; i < roster.size(); i++) {
      sum += roster.get(i).getGpa();
    }
    System.out.println("Roster: " + roster);
    System.out.printf("Average GPA: %.2f%n", sum / roster.size());
    System.out.println("Top student: " + best(roster));
  }
}
