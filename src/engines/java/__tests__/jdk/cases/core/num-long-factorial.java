public class Main {
  public static void main(String[] args) {
    long fact = 1;
    for (int i = 1; i <= 20; i++) {
      fact *= i;
    }
    System.out.println("20! = " + fact);
  }
}
