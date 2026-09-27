import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<List<Integer>> rows = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      rows.add(new ArrayList<>());
      for (int j = 0; j <= i; j++) rows.get(i).add(j);
    }
    System.out.println(rows);
  }
}
