import multer from 'multer';
import {
  ValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  DatabaseError
} from 'sequelize';
import { cleanupUploadedFiles } from '../services/storageService.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
};

/**
 * Global error handler. Maps operational, multer and Sequelize errors to
 * consistent JSON responses and removes orphaned uploads on failure.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = async (err, req, res, next) => {
  await cleanupUploadedFiles(req).catch(() => {});

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors && err.isOperational ? err.errors : null;

  if (err instanceof multer.MulterError) {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large.' : `Upload error: ${err.message}`;
  } else if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    const fields = Object.keys(err.fields || {});
    message = fields.length ? `A record with this ${fields.join(', ')} already exists.` : 'Duplicate record.';
  } else if (err instanceof ForeignKeyConstraintError) {
    statusCode = 409;
    message = 'This action references a record that does not exist or is still in use.';
  } else if (err instanceof ValidationError) {
    statusCode = 422;
    errors = err.errors.map((e) => ({ field: e.path, message: e.message }));
    message = errors[0]?.message || 'Validation failed.';
  } else if (err instanceof DatabaseError) {
    statusCode = 500;
    message = NODE_ENV === 'development' ? err.message : 'A database error occurred.';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body.';
  }

  if (statusCode >= 500) {
    console.error(`[Error] [${req.method}] ${req.originalUrl} - ${err.message}`);
    if (err.stack) console.error(err.stack);
    if (NODE_ENV === 'production' && !err.isOperational) message = 'Internal Server Error';
  }

  if (res.headersSent) return;
  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack })
  });
};

export default { notFoundHandler, errorHandler };
