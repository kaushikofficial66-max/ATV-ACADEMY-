/**
 * Operational error carrying an HTTP status. Throw it from any controller or
 * service; Express 5 forwards rejected promises to the global error handler,
 * which renders it with the standard { success: false, message, errors } shape.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request.', errors = null) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists.') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Validation failed.', errors = null) {
    return new ApiError(422, message, errors);
  }
}

export default ApiError;
