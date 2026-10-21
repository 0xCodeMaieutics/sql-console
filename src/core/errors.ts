export class UserError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 502 = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}
