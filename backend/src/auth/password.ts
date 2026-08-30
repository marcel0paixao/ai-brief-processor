import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const ALGORITHM = 'scrypt';

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await deriveKey(password, salt);
  return `${ALGORITHM}$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encodedPassword: string,
): Promise<boolean> {
  const [algorithm, salt, encodedKey] = encodedPassword.split('$');

  if (algorithm !== ALGORITHM || !salt || !encodedKey) return false;

  const expectedKey = Buffer.from(encodedKey, 'hex');
  const actualKey = await deriveKey(password, salt);

  return (
    expectedKey.length === actualKey.length &&
    timingSafeEqual(expectedKey, actualKey)
  );
}
