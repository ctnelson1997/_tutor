public class Main {
  public static void main(String[] args) {
    int n = 90417;
    int sum = 0, reversed = 0, digits = 0;
    while (n > 0) {
      int d = n % 10;
      sum += d;
      reversed = reversed * 10 + d;
      n /= 10;
      digits++;
    }
    System.out.println(sum + " " + reversed + " " + digits);
  }
}
