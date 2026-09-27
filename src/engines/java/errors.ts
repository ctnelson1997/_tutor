/**
 * Errors the Java engine raises while running a program.
 */

/**
 * A problem the interpreter reports and stops on: an unsupported feature, an
 * undefined name, the step limit. When the message is `ClassName: detail` for
 * a known exception class, `try`/`catch` can catch it as that Java exception.
 */
export class InterpreterError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(line > 0 ? `Line ${line}: ${message}` : message);
    this.line = line;
  }
}

/**
 * A Java exception raised by the runtime itself rather than by a `throw`, such
 * as the NullPointerException from reading a field through null. It is
 * catchable like a thrown exception, and reported like one when uncaught.
 */
export class JavaRuntimeError extends InterpreterError {
  className: string;
  detail: string;
  constructor(className: string, detail: string, line: number) {
    super(`${className}: ${detail}`, line);
    this.className = className;
    this.detail = detail;
  }
}

/**
 * A NullPointerException with a message in the style of Java's helpful NPE
 * messages, e.g. `Cannot read field "val" because "n.next" is null`.
 */
export function nullPointer(detail: string, line: number): JavaRuntimeError {
  return new JavaRuntimeError('NullPointerException', detail, line);
}
