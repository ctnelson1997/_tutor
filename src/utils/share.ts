import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/**
 * Current share link schema version.
 * Bump this if the encoded payload format ever changes.
 */
const SHARE_VERSION = 1;

const VERSION_PREFIX_RE = /^v(\d+)~/;

/**
 * Encode source code into a versioned, URL-safe compressed string.
 * Format: `v<N>~<lz-compressed-code>`
 */
export function encodeShareCode(code: string): string {
  return `v${SHARE_VERSION}~${compressToEncodedURIComponent(code.trim())}`;
}

/**
 * Decode a versioned share string back into source code.
 * Falls back to legacy (unversioned) links for backwards compatibility.
 */
export function decodeShareCode(encoded: string): string | null {
  try {
    const match = VERSION_PREFIX_RE.exec(encoded);
    if (match) {
      const version = Number(match[1]);
      const payload = encoded.slice(match[0].length);
      if (version === 1) {
        return decompressFromEncodedURIComponent(payload);
      }
      // Unknown future version — return null so callers show an error
      return null;
    }
    // Legacy link with no version prefix — decode directly (v1 format)
    return decompressFromEncodedURIComponent(encoded);
  } catch {
    return null;
  }
}
