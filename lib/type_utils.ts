// https://qiita.com/suin/items/e0f7b7add75092196cd8 を参考にした、
// 型ガード関数のヘルパ処理
type WouldBe<T> = { [P in keyof T]?: unknown }

// eslint-disable-next-line import/prefer-default-export
export function isObject<T extends object>(value: unknown): value is WouldBe<T> {
  return typeof value === 'object' && value !== null;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
