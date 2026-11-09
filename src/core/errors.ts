/**
 * Error cuyo mensaje se muestra tal cual al usuario (sin el prefijo "Error: ").
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
