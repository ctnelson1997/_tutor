public class Main {
  public static void main(String[] args) {
    int[] counts = new int[3];
    counts[1]++;
    counts[1]++;
    ++counts[2];
    System.out.println(counts[0] + " " + counts[1] + " " + counts[2]);
  }
}
