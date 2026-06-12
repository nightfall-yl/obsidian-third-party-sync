declare module 'pako' {
  export function inflate(data: any, options?: any): any;
  export function deflate(data: any, options?: any): any;

  const pako: {
    inflate: typeof inflate;
    deflate: typeof deflate;
  };
  export default pako;
}
