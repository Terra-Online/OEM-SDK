const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE62_BASE = BigInt(BASE62_ALPHABET.length);
const POINT_ID_PERMUTATION_MOD = 1n << 36n;
const POINT_ID_PERMUTATION_MULTIPLIER = 25214903917n;
const POINT_ID_PERMUTATION_OFFSET = 11n;
const POINT_ID_TOKEN_LENGTH = 7;

/** Encodes a numeric OEM point ID as the seven-character token used by oem.re. */
export function encodeOEMPointToken(pointId: string): string {
  if (!/^\d+$/.test(pointId)) throw new Error(`Invalid OEM point ID: ${pointId}`);
  const id = BigInt(pointId);
  if (id >= POINT_ID_PERMUTATION_MOD) throw new Error(`OEM point ID is outside the short-link range: ${pointId}`);
  let value = (id * POINT_ID_PERMUTATION_MULTIPLIER + POINT_ID_PERMUTATION_OFFSET) % POINT_ID_PERMUTATION_MOD;
  let encoded = '';
  do {
    encoded = BASE62_ALPHABET[Number(value % BASE62_BASE)] + encoded;
    value /= BASE62_BASE;
  } while (value > 0n);
  return encoded.padStart(POINT_ID_TOKEN_LENGTH, '0');
}

/** Returns the canonical point URL used when a rendered marker is activated. */
export function createOEMPointUrl(pointId: string): string {
  return `https://oem.re/${encodeOEMPointToken(pointId)}`;
}
