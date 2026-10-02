import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const PUBKEY = 'a'.repeat(64);

describe('TauriAmberSigner', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('runs signer requests one at a time instead of cancelling earlier ones', async () => {
    const { TauriAmberSigner } = await import('./tauriAmberSigner');
    const signer = new TauriAmberSigner({ pubkey: PUBKEY, signerPackage: 'com.example.signer' });

    let inFlight = 0;
    let maxInFlight = 0;
    invoke.mockImplementation(async (_cmd, { request }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { result: `plain:${request.content}` };
    });

    const results = await Promise.all([
      signer.nip44.decrypt('b'.repeat(64), 'c1'),
      signer.nip44.decrypt('b'.repeat(64), 'c2'),
      signer.nip44.decrypt('b'.repeat(64), 'c3')
    ]);

    expect(results).toEqual(['plain:c1', 'plain:c2', 'plain:c3']);
    expect(maxInFlight).toBe(1);
    expect(invoke.mock.calls[0][1].request).toMatchObject({
      type: 'nip44_decrypt',
      pubkey: 'b'.repeat(64),
      currentUser: PUBKEY,
      signerPackage: 'com.example.signer'
    });
  });

  it('maps signer rejections to SignerRejectedError and keeps the queue usable', async () => {
    const { TauriAmberSigner, SignerRejectedError } = await import('./tauriAmberSigner');
    const signer = new TauriAmberSigner({ pubkey: PUBKEY });

    invoke.mockRejectedValueOnce('Signer rejected the request');
    invoke.mockResolvedValueOnce({ result: 'ok' });

    await expect(signer.nip44.decrypt('b'.repeat(64), 'c1')).rejects.toBeInstanceOf(SignerRejectedError);
    await expect(signer.nip44.decrypt('b'.repeat(64), 'c2')).resolves.toBe('ok');
  });

  it('remembers the signer package returned by get_public_key', async () => {
    const { TauriAmberSigner } = await import('./tauriAmberSigner');
    const signer = new TauriAmberSigner();
    const onSessionChange = vi.fn();
    signer.onSessionChange = onSessionChange;

    invoke.mockResolvedValueOnce({ result: PUBKEY, package: 'com.example.signer' });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    expect(onSessionChange).toHaveBeenCalledWith({ pubkey: PUBKEY, signerPackage: 'com.example.signer' });
    expect(invoke.mock.calls[0][1].request.type).toBe('get_public_key');
  });
});
