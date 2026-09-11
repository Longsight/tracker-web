import express from 'express';
import http from 'http';
import expressWs from 'express-ws';
import { logger } from './logger.js';

const { log, err } = logger('web');

export const web = (port, db) => {
  const app = express();
  const server = http.createServer(app);
  expressWs(app, server);
  
  app.set('port', port);
  
  app.ws(`/ws`, (ws, req) => {
    ws.on('message', (message) => {
      const { command, race, opts } = JSON.parse(message);
      var results;
      if (!race || !command) {
        results = null;
      }

      if (command == 'fetchAll') {
        results = db.prepare(`
          SELECT c.name, c.bib, c.status, c.speed, max(t.timestamp) AS timestamp, t.lat, t.lon FROM
          tracks AS t, races AS r, competitors as c WHERE
          t.competitor = c.competitorid AND
          c.race = r.raceid AND
          r.tag = @race
          GROUP BY competitor
        `).all({ race });
      }

      if (command == 'fetchCompetitor') {
        const { competitor } = opts;
        if (!competitor) {
          results = null;
        } else {
          const ping = db.prepare(`
            SELECT t.timestamp FROM tracks AS t, races AS r,
            competitors as c WHERE t.competitor = c.competitorid AND
            c.race = r.raceid AND r.tag = @race AND
            c.bib = @competitor ORDER BY t.timestamp DESC LIMIT 1
          `).get({ race, competitor });
          const track = db.prepare(`
            SELECT t.lat, t.lon FROM
            tracks AS t, races AS r, competitors as c WHERE
            t.competitor = c.competitorid AND
            c.race = r.raceid AND
            r.tag = @race AND
            c.bib = @competitor ORDER BY t.timestamp ASC
          `).all({ race, competitor });
          const timings = db.prepare(`
            SELECT ch.\`name\`, chi.checkpoint, chi.timestamp FROM checkins as chi 
            INNER JOIN checkpoints AS ch ON chi.checkpoint = ch.checkpointid
            INNER JOIN races AS r ON ch.race = r.raceid
            INNER JOIN competitors as c ON c.race = r.raceid
            WHERE ch.\`name\` IS NOT NULL AND
            r.tag = @race AND
            c.bib = @competitor ORDER BY ch.\`order\` ASC
          `).all({ race, competitor });
          results = {
            ping,
            track,
            timings,
          };
        }
      }

      if (command == 'fetchCheckpoints') {
        results = db.prepare(`
          SELECT ch.\`name\`, ch.distance, ch.cumulative
          FROM checkpoints as ch, races as r WHERE ch.race = r.raceid
          AND ch.\`name\` IS NOT NULL AND r.tag = @race
          ORDER BY ch.\`order\` ASC
        `).all({ race });
      }

      ws.send(JSON.stringify({
        command,
        results,
        opts,
      }));
      log('Sent WS response');
    });
  });
  
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    res.status(error.status || 500);
    res.json({
      error: error.message
    });
    err(`${error.message}`);
  });
  
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
