import java.util.*;
public class Main {
  public static void main(String[] args) {
    ArrayList<Double> vals = new ArrayList<>();
    vals.add(1.5); vals.add(2.0); vals.add(3.25);
    double total = 0;
    for (double v : vals) total += v;
    System.out.println(total / vals.size());
    System.out.println(vals);
  }
}
