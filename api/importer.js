import fs from 'fs';
import mqtt from 'mqtt';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs'
import { DOMParser } from "xmldom-qsa"
import { mqttconfig } from './config.js';
import { logger } from './logger.js';

const { warn, err } = logger('import');

const customParseMethod = (txt) => {
	return new DOMParser().parseFromString(txt, "text/xml")
}

export const importer = (files) => {
  const {
    url,
    username,
    password,
    topic
  } = mqttconfig;

  const client = mqtt.connect(url, {
    clientId: `mqtt_${Math.random().toString(16).slice(3)}`,
    clean: true,
    connectTimeout: 1000,
    username,
    password,
    reconnectPeriod: 500,
  });

  client.on('connect', () => {
    warn('Connected')
    client.subscribe([topic], () => {
      warn(`Subscribed to topic '${topic}'`);
    })
  });

  client.on('error', (error) => {
    err('Connection failed');
  });

  fs.readFile(files, 'utf8', (readerr, data) => {
    if (readerr) {
      err(readerr);
    }
    const [parsedFile, gpxerr] = parseGPXWithCustomParser(data, customParseMethod);
    if (gpxerr) {
      err(gpxerr);
    }

    const points = parsedFile.tracks[0].points;

    const publishTrack = (index) => {
      if (index >= points.length) {
        client.end();
        return;
      }
      const point = points[index];
      const time = parseInt(new Date(point.time).getTime() / 1000);
      const { latitude, longitude } = point;
      client.publish(topic, 
        `mac:206ef1e26064,time:${time},bat:93,temp:18.80,lat:${latitude},lon:${longitude},imported:1`
      );
      setTimeout(() => publishTrack(index + 1), 10);
    };

    warn(`Sending ${points.length} trackpoints...`);
    publishTrack(0);
  });
}

importer('imported/rh100.gpx');