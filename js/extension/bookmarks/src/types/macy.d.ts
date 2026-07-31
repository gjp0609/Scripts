declare module 'macy' {
  type MacyOptions = {
    container: string | Element;
    trueOrder?: boolean;
    waitForImages?: boolean;
    margin?: number | { x: number; y: number };
    columns?: number;
    breakAt?: Record<number, number>;
    useContainerForBreakpoints?: boolean;
  };

  export default class Macy {
    constructor(options: MacyOptions);
    recalculate(refresh?: boolean, loaded?: boolean): void;
    remove(): void;
  }
}
