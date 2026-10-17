/** java.util.Random: Java's 48-bit LCG, so seeded sequences match real java.util.Random. */

import { type JavaValue, type JavaObject, isJavaObject, javaValueToNumber, javaInt, javaDouble, javaLong, javaFloat, javaBool, javaNull } from '../types';
import { type StdlibContext, StdlibError } from './context';

/** new Random() or new Random(seed). */
export function newRandom(args: JavaValue[], ctx: StdlibContext): JavaValue {
  const seed = args.length > 0 ? BigInt(Math.trunc(javaValueToNumber(args[0]))) : BigInt(Math.trunc(ctx.random() * 2 ** 48));
  const heapId = ctx.allocObject('Random', new Map<string, JavaValue>([['seed', scrambledSeed(seed)]]));
  return { kind: 'objectRef', heapId, className: 'Random' };
}

const RNG_MULT = 0x5DEECE66Dn;
const RNG_ADD = 0xBn;
const RNG_MASK = (1n << 48n) - 1n;

/**
 * The 48-bit state java.util.Random keeps in its `seed` field: the seed it is
 * given, scrambled (Random.setSeed). It fits a double exactly, so it is kept
 * as a long field of the Random object, and the drawing shows it change.
 */
function scrambledSeed(seed: bigint): JavaValue {
  return javaLong((seed ^ RNG_MULT) & RNG_MASK);
}

function rngNext(rng: JavaObject, bits: number): number {
  const state = rng.fields.get('seed');
  const s = ((state?.kind === 'primitive' && typeof state.value === 'bigint' ? state.value : 0n) * RNG_MULT + RNG_ADD) & RNG_MASK;
  rng.fields.set('seed', javaLong(s));
  // Top `bits` bits, interpreted as a signed 32-bit int.
  const shifted = s >> BigInt(48 - bits);
  return Number(BigInt.asIntN(32, shifted));
}

export function randomMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const rng = ctx.heap.get(ref.heapId);
  if (!rng || !isJavaObject(rng)) return undefined;
  switch (method) {
    case 'nextInt': {
      if (args.length === 0) return javaInt(rngNext(rng, 32));
      const bound = javaValueToNumber(args[0]) | 0;
      if (bound <= 0) throw new StdlibError('IllegalArgumentException: bound must be positive');
      if ((bound & -bound) === bound) { // power of two
        return javaInt(Number((BigInt(bound) * BigInt(rngNext(rng, 31))) >> 31n));
      }
      let bits: number, val: number;
      do {
        bits = rngNext(rng, 31);
        val = bits % bound;
      } while (((bits - val + (bound - 1)) | 0) < 0);
      return javaInt(val);
    }
    case 'nextLong': {
      const hi = BigInt(rngNext(rng, 32));
      const lo = BigInt(rngNext(rng, 32));
      return javaLong((hi << 32n) + lo);
    }
    case 'nextBoolean': return javaBool(rngNext(rng, 1) !== 0);
    case 'nextDouble': {
      const hi = rngNext(rng, 26);
      const lo = rngNext(rng, 27);
      return javaDouble((hi * 2 ** 27 + lo) / 2 ** 53);
    }
    case 'nextFloat': return javaFloat(rngNext(rng, 24) / 2 ** 24);
    case 'setSeed':
      rng.fields.set('seed', scrambledSeed(BigInt(Math.trunc(javaValueToNumber(args[0])))));
      return javaNull();
  }
  return undefined;
}
