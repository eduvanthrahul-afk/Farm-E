'use strict';

const winston = require('winston');
const config = require('../config/env');

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const logger = winston.createLogger({
  level: config.log.level,
  format: combine(timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: 'farme-api' },
  transports: [
    new winston.transports.Console({
      format: config.isDev ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),
  ],
});

module.exports = logger;
