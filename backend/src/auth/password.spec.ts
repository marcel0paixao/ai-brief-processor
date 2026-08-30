import { hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('stores a salted hash and verifies the original password', async () => {
    const password = 'SecurePass123';
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).not.toBe(password);
    expect(secondHash).not.toBe(firstHash);
    await expect(verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPass123', firstHash)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed stored hashes without throwing', async () => {
    await expect(
      verifyPassword('SecurePass123', 'not-a-valid-hash'),
    ).resolves.toBe(false);
  });
});
