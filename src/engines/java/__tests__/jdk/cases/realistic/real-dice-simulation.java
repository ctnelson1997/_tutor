import java.util.Random;
public class Main {
  public static void main(String[] args) {
    Random rng = new Random(2024);
    int[] counts = new int[13];
    for (int i = 0; i < 200; i++) {
      int roll = rng.nextInt(6) + 1 + rng.nextInt(6) + 1;
      counts[roll]++;
    }
    for (int s = 2; s <= 12; s++) {
      System.out.println(s + ": " + counts[s]);
    }
  }
}
