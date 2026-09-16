import fs from 'fs';
import readline from 'readline';
import haversine from 'haversine';
import Database from 'better-sqlite3';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs'
import { DOMParser } from "xmldom-qsa"
import { logger } from './logger.js';

const { log, err } = logger('boot');

const db = new Database('races.db');
db.pragma('journal_mode = WAL');

const customParseMethod = (txt) => {
	return new DOMParser().parseFromString(txt, "text/xml")
}

const chain = (list, func) => {
  return list.reduce((memo, next, index) => memo.then(() => func(next, index)), Promise.resolve(true));
}

const lerp = (x, y, a) => x * (1 - a) + y * a;

const processSQL = (files) => {
  if (Array.isArray(files)) {
    return chain(files, processSQL);
  }
  return new Promise((resolve) => {
    const readInterface = readline.createInterface({
      input: fs.createReadStream(files),
      console: false
    });
    
    var stmt = '';
    readInterface.on('line', (line) => {
      if (!line) {
        return;
      }
      if (line.startsWith(' ')) {
        log(line);
        stmt = `${stmt} ${line.trim()}`;
      } else {
        log(stmt);
        var bind = null;
        if (line.startsWith('{')) {
          bind = JSON.parse(line);
        }
        if (!!stmt) {
          try {
            if (bind) {
              db.prepare(stmt).run(bind);
            } else {
              db.prepare(stmt).run();
            }
          } catch (e) {
            err(e.message);
          }
        }
        if (!bind) {
          stmt = line;
        }
      }
    });
    readInterface.on('close', () => {
      resolve();
    });
  });
}

const processGPX = (files, raceIndex) => {
  if (Array.isArray(files)) {
    return chain(files, processGPX);
  }
  return new Promise((resolve) => {
    fs.readFile(files, 'utf8', (readerr, data) => {
      if (readerr) {
        err(readerr);
      }
      const [parsedFile, gpxerr] = parseGPXWithCustomParser(data, customParseMethod);
      if (gpxerr) {
        err(gpxerr);
      }
      const wpStmt = db.prepare(`
        insert into checkpoints (\`name\`, race, \`order\`, coords, cumulative, distance) values
        (@name, @race, @order, @coords, @cumulative, @distance)
      `);
      var pointIndex = 0;
      var lastMinPoint = 0;
      var lastMinDist = 100;
      var lastCPDist = 0;
      const points = parsedFile.tracks[0].points;
      parsedFile.waypoints.forEach((checkpoint, index) => {
        while (true) {
          if (!points[index]) {
            break;
          }
          const dist = haversine(points[pointIndex], checkpoint, {unit: 'meter'});
          if (dist < 10) {
            lastMinPoint = pointIndex;
            lastMinDist = dist;
            break;
          }
          if (dist < 100) {
            if (dist < lastMinDist) {
              lastMinPoint = pointIndex;
              lastMinDist = dist;
            }
          } else {
            if (lastMinDist < 100) {
              break;
            }
          }
          pointIndex++;
        }
        const coords = JSON.stringify(points.slice(
          lastMinPoint,
          Math.min(Math.max(lastMinPoint + 2, pointIndex), points.length)
        ).map(({latitude, longitude}) => ({latitude, longitude})).reduce((memo, next, index, orig) => {
          if (index == 0) {
            return [next];
          } else {
            const lerpCount = parseInt(haversine(orig[index - 1], next, {unit: 'meter'}), 30);
            const lerpPoints = [];
            for (var i = 1; i < lerpCount; i++) {
              lerpPoints.push({
                latitude: lerp(orig[index - 1].latitude, next.latitude, (1.0 / lerpCount) * i),
                longitude: lerp(orig[index - 1].longitude, next.longitude, (1.0 / lerpCount) * i),
              });
            }
            return [...memo, ...lerpPoints, next];
          }
        }, []).map(({latitude, longitude}) => [latitude, longitude]));
        const cumulative = parseInt(parsedFile.tracks[0].distance.cumulative[lastMinPoint]);
        try {
          wpStmt.run({
            order: index,
            race: raceIndex + 1,
            distance: cumulative - lastCPDist,
            cumulative,
            name: null,
            coords,
            ...checkpoint
          });
        } catch (e) {
          err(e.message);
        }
        lastMinDist = 100;
        lastCPDist = cumulative;
      });
      resolve();
    });
  });
}

processSQL(['schema.sql', 'bootstrap/first.sql'])
  .then(() => processGPX([
    '../client/public/gpx/rh100.gpx',
    '../client/public/gpx/equinox.gpx',
  ]))
