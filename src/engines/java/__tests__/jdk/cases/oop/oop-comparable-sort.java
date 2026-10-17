import java.util.*;
public class Main {
  static class Student implements Comparable<Student> {
    String name; int score;
    Student(String n, int s) { name = n; score = s; }
    public int compareTo(Student o) { return this.score - o.score; }
    public String toString() { return name + ":" + score; }
  }
  public static void main(String[] args) {
    List<Student> list = new ArrayList<>();
    list.add(new Student("Ann", 90));
    list.add(new Student("Bob", 72));
    list.add(new Student("Cy", 85));
    Collections.sort(list);
    System.out.println(list);
  }
}
