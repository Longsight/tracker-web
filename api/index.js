import Database from 'better-sqlite3';

import { web } from './web.js';
import { mqttsub } from './mqttsub.js';
import { mqttconfig } from './config.js';

const db = new Database('races.db');
db.pragma('journal_mode = WAL');

import tls from 'node:tls';
tls.setDefaultCACertificates(tls.getCACertificates('system'));

/**
 * Normalize a port into a number, string, or false.
*/

function normalizePort(val) {
  var port = parseInt(val, 10);
  
  if (isNaN(port)) {
    return val;
  }
  if (port > 0) {
    return port;
  }
  
  return false;
}

var port = normalizePort(process.env.PORT || '5000');

web(port, db);
mqttsub(mqttconfig, db);
