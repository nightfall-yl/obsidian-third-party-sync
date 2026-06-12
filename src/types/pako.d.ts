declare module 'pako' {
  export function inflate(data: Uint8Array, options?: Record<string, unknown>): Uint8Array;
  export function deflate(data: Uint8Array, options?: Record<string, unknown>): Uint8Array;

  const pako: {
    inflate: typeof inflate;
    deflate: typeof deflate;
  };
  export default pako;
}
