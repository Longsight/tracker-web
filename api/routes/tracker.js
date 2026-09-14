export const trackerRoute = (db) => {
  return (req, res, next) => {
    try {
      const tracker = db.prepare(`
        SELECT r.sleep_time, r.queue_size, r.start_time, r.finish_time, t.battery_capacity
        FROM trackers AS t, competitors AS c, races as r
        WHERE t.competitor = c.competitorid
        AND c.race = race.raceid
        AND t.mac = @mac
      `).get(req.params);
      res.json(tracker);
    } catch (e) {
      res.status(500);
    }
  }
}