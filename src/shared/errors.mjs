export class HarnessError extends Error {
  constructor(code, message, { exitCode = 2, facts = null, repair = null } = {}) {
    super(message);
    this.name = "HarnessError";
    this.code = code;
    this.exitCode = exitCode;
    this.facts = facts;
    this.repair = repair;
  }
}

export function fail(code, message, options) {
  throw new HarnessError(code, message, options);
}
