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

const chain = (list, func) => {
  return list.reduce((memo, next, index) => {
    if (memo == null) {
      memo = func(next);
    }
    console.log(`+++ ${index}`);
    if (index < (list.length - 1)) {
      return memo.then(func(list[index + 1]));
    }
    return memo;
  }, null);
}

const processSQL = (files) => {
  if (Array.isArray(files)) {
    return chain(files, processSQL);
  }
  return new Promise((resolve, reject) => {
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
      resolve();
    });
  });
}

const processGPX = (files) => {
  if (Array.isArray(files)) {
    return chain(files, processGPX);
  }
  return new Promise((resolve, reject) => {
    fs.readFile(files, 'utf8', (err, data) => {
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
          Math.min(lastMinPoint + 5, points.length)
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
      resolve();
    });
  });
}

processSQL(['schema.sql', 'bootstrap/first.sql'])
  .then(processGPX('../client/public/gpx/rh100.gpx')) 
  .then(processSQL('bootstrap/second.sql'));
