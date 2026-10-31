import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { connectDatabase } from './database.js';
import { requirementsRouter } from './routes/requirements.js';

const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.phone'],
    remove: true,
  },
});

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:4200,http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    },
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, serializers: { req: (request) => ({ method: request.method, url: request.url }) } }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'trainlead-api' });
});

app.use('/api/requirements', requirementsRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
  response.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== 'test') {
  connectDatabase()
    .then(() => app.listen(port, () => logger.info({ port }, 'TrainLead API listening')))
    .catch((error: unknown) => {
      logger.fatal({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not connect to MongoDB');
      process.exitCode = 1;
    });
}

export { app };