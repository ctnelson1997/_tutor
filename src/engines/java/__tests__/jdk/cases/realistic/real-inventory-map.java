import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<String, Integer> stock = new TreeMap<>();
    stock.put("apples", 10);
    stock.put("pears", 4);
    stock.put("kiwis", 0);
    stock.put("apples", stock.get("apples") - 3);
    for (String item : stock.keySet()) {
      int qty = stock.get(item);
      String status = qty == 0 ? "OUT" : qty < 5 ? "LOW" : "OK";
      System.out.println(item + "=" + qty + " [" + status + "]");
    }
  }
}
