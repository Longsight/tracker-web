import { logger } from '../logger.js';

const { err } = logger('web');

export const errorRoute = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  res.status(error.status || 500);
  res.json({
    error: error.message
  });
  err(`${error.message}`);
};