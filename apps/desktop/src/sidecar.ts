import { invoke, isTauri } from '@tauri-apps/api/core';

type SidecarConnection = { port: number; nonce: string };

export async function sidecarRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isTauri()) throw new Error('Desktop app required for replay and API actions.');
  const connection = await invoke<SidecarConnection>('sidecar_connection');
  const response = await fetch(`http://127.0.0.1:${connection.port}${path}`, {
    ...init,
    headers: { ...init.headers, 'X-Editor-Session': connection.nonce },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.message || `Engine request failed (${response.status}).`);
  return body as T;
}

export async function sidecarBlobRequest(path: string): Promise<Blob> {
  if (!isTauri()) throw new Error('Desktop app required for beatmap assets.');
  const connection = await invoke<SidecarConnection>('sidecar_connection');
  const response = await fetch(`http://127.0.0.1:${connection.port}${path}`, {
    headers: { 'X-Editor-Session': connection.nonce },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Engine request failed (${response.status}).`);
  }
  return response.blob();
}

export async function checkSidecar(): Promise<'ready' | 'offline' | 'demo'> {
  if (!isTauri()) return 'demo';
  try {
    const connection = await invoke<SidecarConnection>('sidecar_connection');
    const response = await fetch(`http://127.0.0.1:${connection.port}/health`, {
      headers: { 'X-Editor-Session': connection.nonce },
      signal: AbortSignal.timeout(1800),
    });
    return response.ok ? 'ready' : 'offline';
  } catch {
    return 'offline';
  }
}
