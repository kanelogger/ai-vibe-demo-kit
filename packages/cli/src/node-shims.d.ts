declare module "node:fs/promises" {
  export const access: any;
  export const copyFile: any;
  export const mkdir: any;
  export const readdir: any;
  export const readFile: any;
  export const rm: any;
  export const stat: any;
  export const writeFile: any;
}

declare module "node:path" {
  export const basename: any;
  export const dirname: any;
  export const join: any;
  export const relative: any;
  export const resolve: any;
  export const sep: string;
}

declare module "node:url" {
  export const fileURLToPath: any;
}

interface ImportMeta {
  url: string;
}

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  execPath: string;
};
