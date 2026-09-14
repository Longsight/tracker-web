import { logger } from '../logger.js';

const { log, err } = logger('web');

export const trackerRoute = (db) => {
  return (req, res, next) => {
    try {
      const tracker = db.prepare(`
        SELECT r.sleep_time, r.queue_size, r.start_time, r.finish_time, t.battery_capacity
        FROM trackers AS t, competitors AS c, races as r
        WHERE t.competitor = c.competitorid
        AND c.race = r.raceid
        AND t.mac = @mac
      `).get(req.params);
      res.send(tracker);
      log(`Sent config to tracker ${req.params.mac}`);
    } catch (e) {
      res.status(500);
      res.send(e);
      err(e);
    }
  }
}