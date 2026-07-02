export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, error?: E, value?: T) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;

    Object.freeze(this);
  }

  public get value(): T {
    if (!this.isSuccess) {
      throw new Error('Can not get the value of a failure result.');
    }
    return this._value as T;
  }

  public get error(): E {
    if (this.isSuccess) {
      throw new Error('Can not get the error of a success result.');
    }
    return this._error as E;
  }

  public static ok<U, F = string>(value?: U): Result<U, F> {
    return new Result<U, F>(true, undefined, value);
  }

  public static fail<U, F = string>(error: F): Result<U, F> {
    return new Result<U, F>(false, error, undefined);
  }

  public static combine(results: Result<any, any>[]): Result<void, any> {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}
