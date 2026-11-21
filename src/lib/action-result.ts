// What a server action returns. Actions never throw a message: production
// masks thrown messages, so the error travels as data.
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
