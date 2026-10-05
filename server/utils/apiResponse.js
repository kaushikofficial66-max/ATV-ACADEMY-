/**
 * Standardized API Response Helper Functions
 */

export const successResponse = (res, { statusCode = 200, message = 'Success', data = null, meta = null }) => {
  const response = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta !== null && { meta })
  };
  return res.status(statusCode).json(response);
};

export const errorResponse = (res, { statusCode = 500, message = 'An error occurred', errors = null }) => {
  const response = {
    success: false,
    message,
    ...(errors !== null && { errors })
  };
  return res.status(statusCode).json(response);
};

export default {
  successResponse,
  errorResponse
};
