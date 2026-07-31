import { parseJava } from './src/engines/java/parser';
import { JavaInterpreter } from './src/engines/java/interpreter';

function run(src: string, stdin = ''): string {
  try {
    const interp = new JavaInterpreter(stdin);
    const r = interp.execute(parseJava(src));
    if (r.error) return 'ERR: ' + r.error;
    const last = r.snapshots[r.snapshots.length - 1];
    return (last?.stdout || []).join(' | ');
  } catch (e) {
    return 'THROW: ' + (e as Error).message;
  }
}
const wrap = (b: string) => `public class Main { public static void main(String[] args){ ${b} } }`;
const runW = (b: string) => run(wrap(b));

// ── Tier 1 ──
console.log('T1 System.err:', JSON.stringify(runW(`System.err.println("oops"); System.out.println("ok");`)));
console.log('T1 repeat/strip/isBlank:', JSON.stringify(runW(`System.out.println("ab".repeat(3)); System.out.println("  hi  ".strip()+"|"); System.out.println("   ".isBlank());`)));
console.log('T1 replaceAll/matches:', JSON.stringify(runW(`System.out.println("a1b2".replaceAll("[0-9]","#")); System.out.println("abc".matches("[a-z]+"));`)));

// ── Tier 2 ──
console.log('T2 toString override:', JSON.stringify(run(
  `public class Main {
    static class Point { int x,y; Point(int x,int y){this.x=x;this.y=y;} public String toString(){ return "("+x+","+y+")"; } }
    public static void main(String[] args){ Point p = new Point(1,2); System.out.println(p); System.out.println("p="+p); }
  }`)));
console.log('T2 custom equals in Set:', JSON.stringify(run(
  `import java.util.*;
   public class Main {
    static class P { int x; P(int x){this.x=x;} public boolean equals(Object o){ return o instanceof P && ((P)o).x==x; } public int hashCode(){ return x; } }
    public static void main(String[] args){ HashSet<P> s=new HashSet<>(); s.add(new P(1)); s.add(new P(1)); s.add(new P(2)); System.out.println(s.size()); }
  }`)));
console.log('T2 Comparable sort:', JSON.stringify(run(
  `import java.util.*;
   public class Main {
    static class P implements Comparable<P> { int x; P(int x){this.x=x;} public int compareTo(P o){ return x-o.x; } public String toString(){return ""+x;} }
    public static void main(String[] args){ ArrayList<P> l=new ArrayList<>(); l.add(new P(3)); l.add(new P(1)); l.add(new P(2)); Collections.sort(l); System.out.println(l); }
  }`)));

// ── Tier 3 ──
console.log('T3 try/catch parseInt:', JSON.stringify(runW(`try { int x = Integer.parseInt("abc"); System.out.println(x); } catch (NumberFormatException e) { System.out.println("caught: "+e.getMessage()); }`)));
console.log('T3 throw+catch+getMessage:', JSON.stringify(runW(`try { throw new IllegalArgumentException("bad arg"); } catch (IllegalArgumentException e) { System.out.println(e.getMessage()); }`)));
console.log('T3 divide by zero:', JSON.stringify(runW(`try { int x = 5/0; } catch (ArithmeticException e) { System.out.println("math: "+e.getMessage()); }`)));
console.log('T3 array OOB:', JSON.stringify(runW(`int[] a={1,2}; try { int x=a[5]; } catch (ArrayIndexOutOfBoundsException e) { System.out.println("oob"); }`)));
console.log('T3 catch-all Exception:', JSON.stringify(runW(`try { Object o=null; throw new RuntimeException("r"); } catch (Exception e) { System.out.println("gen:"+e.getMessage()); }`)));
console.log('T3 finally runs:', JSON.stringify(runW(`try { System.out.println("t"); throw new RuntimeException("x"); } catch (Exception e) { System.out.println("c"); } finally { System.out.println("f"); }`)));
console.log('T3 finally on return:', JSON.stringify(run(
  `public class Main { static int f(){ try { return 1; } finally { System.out.println("fin"); } } public static void main(String[] a){ System.out.println(f()); } }`)));
console.log('T3 multi-catch:', JSON.stringify(runW(`try { throw new NullPointerException("np"); } catch (ArithmeticException | NullPointerException e) { System.out.println("multi:"+e.getMessage()); }`)));
console.log('T3 uncaught:', JSON.stringify(runW(`throw new IllegalStateException("nope");`)));
console.log('T3 user exception:', JSON.stringify(run(
  `public class Main {
    static class MyException extends Exception { public MyException(String m){ super(m); } }
    static void go() throws MyException { throw new MyException("custom"); }
    public static void main(String[] args){ try { go(); } catch (MyException e) { System.out.println("mine:"+e.getMessage()); } }
  }`)));
console.log('T3 rethrow propagates:', JSON.stringify(run(
  `public class Main { static void a(){ throw new RuntimeException("deep"); } static void b(){ a(); } public static void main(String[] x){ try { b(); } catch (RuntimeException e){ System.out.println("caught:"+e.getMessage()); } } }`)));
