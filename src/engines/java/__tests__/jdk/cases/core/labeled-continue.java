public class Main {
  public static void main(String[] args) {
    int count = 0;
    outer:
    for (int i = 0; i < 4; i++) {
      for (int j = 0; j < 4; j++) {
        if (j > i) continue outer;
        count++;
      }
    }
    System.out.println(count);
  }
}
