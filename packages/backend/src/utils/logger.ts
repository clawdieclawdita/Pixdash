import pino from 'pino';

export function createLogger(level: pino.LevelWithSilent = 'info'): pino.Logger {
  return pino({
    level,
    transport: process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard'
          }
        }
      : undefined
  });
}
