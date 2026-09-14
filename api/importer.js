import fs from 'fs';
import mqtt from 'mqtt';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs'
import { DOMParser } from "xmldom-qsa"
import { mqttconfig } from './config.js';
import { logger } from './logger.js';

const { log, err } = logger('import');

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
    log('Connected')
    client.subscribe([topic], () => {
      log(`Subscribed to topic '${topic}'`);
    })
  });

  client.on('error', (error) => {
    err('Connection failed');
  });

  fs.readFile(files, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
    }
    const [parsedFile, gpxerr] = parseGPXWithCustomParser(data, customParseMethod);
    if (gpxerr) {
      console.error(gpxerr);
    }
    log(parsedFile.tracks[0]);
  });
}

importer('imported/rh100.gpx');