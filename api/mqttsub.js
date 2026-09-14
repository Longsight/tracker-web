import mqtt from 'mqtt';
import haversine from 'haversine';
import { logger } from './logger.js';

const { log, err } = logger('mqtt');

export const mqttsub = (config, db) => {
  const {
    url,
    username,
    password,
    topic
  } = config;

  const client = mqtt.connect(url, {
    clientId: `mqtt_${Math.random().toString(16).slice(3)}`,
    clean: false,
    connectTimeout: 1000,
    username,
    password,
    reconnectPeriod: 500,
  });

  client.on('connect', () => {
    log('Connected')
    client.subscribe([topic], () => {
      log(`Subscribed to topic '${topic}'`);
    })
  });

  client.on('error', (error) => {
    err('Connection failed');
  });

  client.on('message', (msgTopic, payload) => {
    // Check message validity
    if (msgTopic != topic) {
      return;
    }
    const msg = payload.toString();
    if (!msg.match(/mac:[0-9a-f]{12},time:\d{10,},bat:\d+,temp:[0-9.]+,lat:-?[0-9.]+,lon:-?[0-9.]+(,imported:1)?/)) {
      return;
    }

    // Check competitor exists
    const {mac, time, bat, temp, lat, lon, imported} = Object.fromEntries(msg.split(',').map(part => part.split(':')));
    const comp = db.prepare(`
      SELECT t.competitor, r.* FROM trackers AS t, competitors AS c, races AS r
        WHERE t.mac = @mac AND t.competitor IS NOT NULL AND c.competitorid = t.competitor AND
        r.raceid = c.race
    `).get({ mac });
    if (!comp.competitor) {
      err(`No competitor found matching tracker ${mac}`);
      return;
    }

    // Check race is happening
    const now = parseInt(Date.now() / 1000);
    if (now < parseInt(comp.start_time)) {
      err(`Race ${comp.name} is not currently in progress`);
      return;
    }
    const newCoords = {
      latitude: lat,
      longitude: lon,
    };

    // Insert new track
    try {
      db.prepare(`
        INSERT INTO tracks (competitor, timestamp, lat, lon, bat, temp)
          VALUES (@comp, @time, @lat, @lon, @bat, @temp)
      `).run({
        comp: comp.competitor,
        time, lat, lon, bat, temp
      });
    } catch (error) {
      err(error);
    }

    // Get last checkpoint
    const lastCP = db.prepare(`
      SELECT c.* FROM checkins AS ch, checkpoints as c WHERE ch.competitor = @comp AND
        ch.checkpoint = c.checkpointid ORDER BY c.\`order\` DESC LIMIT 1
    `).get({ race: comp.raceid, comp: comp.competitor });
    const lastOrder = !!lastCP? lastCP.order: -1;

    // Test next checkpoint against new track
    const nextCP = db.prepare(`
      SELECT * FROM checkpoints WHERE race = @race AND \`order\` > @order ORDER BY \`order\` ASC LIMIT 1
    `).get({ race: comp.raceid, order: lastOrder });
    const cpCoords = JSON.parse(nextCP.coords);
    if (!haversine(newCoords, cpCoords[0], {threshold: 1500, unit: 'meter'})) {
      return;
    }
    return cpCoords.some((testCoords) => {
      if (!!lastCP && nextCP.name == lastCP.name) {
        return;
      }
      if (haversine(newCoords, testCoords, {threshold: 200, unit: 'meter'})) {
        try {
          db.prepare(`
            INSERT INTO checkins (competitor, checkpoint, timestamp)
            VALUES (@comp, @cp, @time)
          `).run({
            comp: comp.competitor,
            cp: nextCP.checkpointid,
            time
          });
          log(`Competitor ${comp.competitor} in race ${comp.raceid} reached CP ${nextCP.checkpointid}`);
        } catch (error) {
          err(error);
        }
      }
    });
  });
}
