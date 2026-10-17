import java.util.*;
public class Main {
  public static void main(String[] args) {
    Queue<String> line = new ArrayDeque<>();
    line.offer("Ann");
    line.offer("Ben");
    line.offer("Cat");
    int minute = 0;
    while (!line.isEmpty()) {
      minute++;
      String served = line.poll();
      System.out.println("Minute " + minute + ": served " + served + ", waiting " + line.size());
      if (minute == 1) line.offer("Dan");
    }
  }
}
