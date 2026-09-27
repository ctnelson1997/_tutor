public class Main {
  static class P { String name; int age; P(String n, int a) { name = n; age = a; } }
  public static void main(String[] args) {
    P[] people = { new P("Ann", 20), new P("Bob", 30) };
    people[1].age = 31;
    System.out.println(people[0].name + " " + people[1].age);
  }
}
