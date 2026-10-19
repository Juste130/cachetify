const winston = require('winston');
const { config } = require('../config');

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Serverless (Netlify Functions, i.e. AWS Lambda): the filesystem is read-only outside /tmp,
// so winston's File transport fails creating ./logs (EROFS) while this module loads, taking
// every API route down with a 500. Logs there are captured from the console anyway (Netlify's
// function logs), and a file on an ephemeral instance would be lost with it.
const isServerless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

function fileTransports() {
    if (isServerless) return [];
    return [
        // File transport for errors
        new winston.transports.File({
            filename: `${config.logFilePath}/error.log`,
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: `${config.logFilePath}/combined.log`,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
        }),
    ];
}

// Cached on globalThis for the same reason as the Prisma client (see ../db.js): Next.js dev
// re-evaluates this module on every reload, and each evaluation would otherwise open two new
// log file streams that are never closed.
const globalForLogger = globalThis;

const logger = globalForLogger.__cachetifyLogger || winston.createLogger({
    level: config.logLevel,
    format: logFormat,
    defaultMeta: { service: 'cachetify-backend' },
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(
                    ({ level, message, timestamp, ...metadata }) => {
                        let msg = `${timestamp} [${level}]: ${message}`;
                        if (Object.keys(metadata).length > 0) {
                            msg += ` ${JSON.stringify(metadata)}`;
                        }
                        return msg;
                    }
                )
            ),
        }),
        ...fileTransports(),
    ],
});

if (process.env.NODE_ENV === 'development') {
    globalForLogger.__cachetifyLogger = logger;
}

module.exports = logger;
