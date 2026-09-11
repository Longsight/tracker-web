import fs from 'fs';
import readline from 'readline';
import haversine from 'haversine';
import Database from 'better-sqlite3';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs'
import { DOMParser } from "xmldom-qsa"

const db = new Database('races.db');
db.pragma('journal_mode = WAL');

const customParseMethod = (txt) => {
	return new DOMParser().parseFromString(txt, "text/xml")
}

const processSQL = (filename, callback) => {
  const readInterface = readline.createInterface({
    input: fs.createReadStream(filename),
    console: false
  });
  
  var stmt = '';
  readInterface.on('line', (line) => {
    if (!line) {
      return;
    }
    if (line.startsWith(' ')) {
      console.log(`>>> ${line}`);
      stmt = `${stmt} ${line.trim()}`;
    } else {
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
          console.log();
          console.error(`!!! ${e.message}`);
        }
      }
      console.log();
      console.log(`>>> ${line}`);
      if (!bind) {
        stmt = line;
      }
    }
  });
  readInterface.on('close', () => {
    if (callback) {
      callback();
    }
  });
}

const processGPX = (filename, callback) => {
  fs.readFile(filename, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
    }
    const [parsedFile, gpxerr] = parseGPXWithCustomParser(data, customParseMethod);
    if (gpxerr) {
      console.error(gpxerr);
    }
    const wpStmt = db.prepare(`
      insert into checkpoints (\`name\`, race, \`order\`, coords, cumulative, distance) values
      (@name, @race, @order, @coords, @cumulative, @distance)
    `);
    var pointIndex = 0;
    var lastMinPoint = 0;
    var lastMinDist = 200;
    var lastCPDist = 0;
    const points = parsedFile.tracks[0].points;
    parsedFile.waypoints.forEach((checkpoint, index) => {
      while (true) {
        const dist = haversine(points[pointIndex], checkpoint, {unit: 'meter'});
        if (dist < 10) {
          lastMinPoint = pointIndex;
          lastMinDist = dist;
          break;
        }
        if (dist < 200) {
          if (dist < lastMinDist) {
            lastMinPoint = pointIndex;
            lastMinDist = dist;
          }
        } else {
          if (lastMinDist < 200) {
            break;
          }
        }
        pointIndex++;
      }
      const coords = JSON.stringify(points.slice(
        lastMinPoint,
        Math.min(lastMinPoint + 3, points.length)
      ).map((coord) => ({
        latitude: coord.latitude,
        longitude: coord.longitude,
      })));
      const cumulative = parseInt(parsedFile.tracks[0].distance.cumulative[lastMinPoint]);
      try {
        wpStmt.run({
          order: index,
          race: 1,
          distance: cumulative - lastCPDist,
          cumulative,
          name: null,
          coords,
          ...checkpoint
        });
      } catch (e) {
        console.log();
        console.error(`!!! ${e.message}`);
      }
      lastMinDist = 200;
      lastCPDist = cumulative;
    });
    if (callback) {
      callback();
    }
  });
}

processSQL('bootstrap/first.sql', () => processGPX('../client/public/gpx/rh100.gpx', () => processSQL('bootstrap/second.sql')))
