public class Main {
  public static void main(String[] args) {
    int n = 50;
    boolean[] isComposite = new boolean[n + 1];
    for (int i = 2; i * i <= n; i++) {
      if (!isComposite[i]) {
        for (int j = i * i; j <= n; j += i) {
          isComposite[j] = true;
        }
      }
    }
    int count = 0;
    for (int i = 2; i <= n; i++) {
      if (!isComposite[i]) {
        System.out.print(i + " ");
        count++;
      }
    }
    System.out.println();
    System.out.println(count + " primes");
  }
}
