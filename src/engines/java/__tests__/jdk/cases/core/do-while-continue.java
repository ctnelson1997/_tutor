public class Main {
  public static void main(String[] args) {
    int i = 0, sum = 0;
    do {
      i++;
      if (i % 2 == 0) continue;
      sum += i;
    } while (i < 9);
    System.out.println(sum);
  }
}
