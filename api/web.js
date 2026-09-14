import express from 'express';
import http from 'http';
import expressWs from 'express-ws';
import { wsRoute } from './routes/ws.js';
import { trackerRoute } from './routes/tracker.js';
import { errorRoute } from './routes/error.js';
import { logger } from './logger.js';

const { log, err } = logger('web');

export const web = (port, db) => {
  const app = express();
  const server = http.createServer(app);
  expressWs(app, server);
  app.set('port', port);
  
  app.ws(`/ws`, wsRoute(db));
  app.get('/tracker', trackerRoute);
  app.use(errorRoute);
  
  server.listen(port);
  log(`Listening on port ${port} for WebSocket clients`);
  server.on('error', onError);

  return server;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      err(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      err(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}
