/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*.html?raw' {
  const content: string;
  export default content;
}
