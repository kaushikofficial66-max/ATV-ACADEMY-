import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { cleanupUploadedFiles } from '../services/storageService.js';

/**
 * Runs express-validator chains and throws a 422 with field errors.
 * Usage: router.post('/', validate([body('title').notEmpty()]), handler)
 */
export const validate = (chains) => async (req, res, next) => {
  for (const chain of chains) {
    await chain.run(req);
  }
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  await cleanupUploadedFiles(req);
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  throw ApiError.unprocessable(errors[0].message, errors);
};

/** Ensures numeric route params (e.g. :courseId) are positive integers. */
export const validateIdParams = (req, res, next) => {
  for (const [key, value] of Object.entries(req.params || {})) {
    if (/id$/i.test(key) && !/^\d+$/.test(String(value))) {
      throw ApiError.badRequest(`Invalid ${key}.`);
    }
  }
  next();
};

export default validate;
