/// <reference types="vite/client" />

declare module '*.json' {
  const value: unknown;
  export default value;
}

declare module 'macy' {
  type MacyOptions = {
    container: string | Element;
    trueOrder?: boolean;
    waitForImages?: boolean;
    margin?: number | { x: number; y: number };
    columns?: number;
    useContainerForBreakpoints?: boolean;
    breakAt?: Record<number, number>;
  };

  type MacyInstance = {
    recalculate: (refresh?: boolean, loaded?: boolean) => void;
    remove: () => void;
  };

  export default function Macy(options: MacyOptions): MacyInstance;
}
