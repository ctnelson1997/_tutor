public class Main {
  static class InvalidAgeException extends Exception {
    public InvalidAgeException(String message) { super(message); }
  }
  static void checkAge(int age) throws InvalidAgeException {
    if (age < 0 || age > 150) {
      throw new InvalidAgeException("Invalid age: " + age);
    }
    System.out.println("Age " + age + " is valid");
  }
  public static void main(String[] args) {
    int[] ages = {25, -3, 200, 40};
    for (int a : ages) {
      try {
        checkAge(a);
      } catch (InvalidAgeException e) {
        System.out.println("Caught: " + e.getMessage());
      }
    }
  }
}
