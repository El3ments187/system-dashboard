interface MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  mock: { calls: TArgs[][] };
  (...args: TArgs): TReturn;
}

declare const global: typeof globalThis;
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
type MatcherUtils = {
  not: {
    toEqual: (expected: unknown) => void;
    toBeInTheDocument: () => void;
    toBe: (expected: unknown) => void;
    toBeNull: () => void;
  };
};
declare const expect: <T = any>(
  value: T,
) => {
  toBeInTheDocument: () => void;
  toBe: (expected: unknown) => void;
  toHaveBeenCalled: () => void;
  toEqual: (expected: unknown) => void;
  toBeNull: () => void;
} & MatcherUtils;
declare const vi: {
  mock: (
    name: string,
    impl?: Record<string, unknown> | (() => Record<string, unknown>),
  ) => void;
  fn: <TArgs extends unknown[] = unknown[], TReturn = unknown>(
    impl?: (...args: TArgs) => TReturn,
  ) => MockFn<TArgs, TReturn>;
};
