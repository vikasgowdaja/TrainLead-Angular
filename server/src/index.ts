import './config/env.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { connectDatabase } from './database.js';
import { HttpError } from './http.js';
import { adminRouter } from './routes/admin.js';
import { applicationsRouter } from './routes/applications.js';
import { authRouter } from './routes/auth.js';
import { inboxRouter } from './routes/inbox.js';
import { organizationsRouter } from './routes/organizations.js';
import { requirementsRouter } from './routes/requirements.js';
import { skillsRouter } from './routes/skills.js';
import { trainerProfileRouter } from './routes/trainer-profile.js';

const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.phone', 'req.body.password'],
    remove: true,
  },
});

const app = express();
app.set('trust proxy', 'loopback');
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
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req: (request) => ({ method: request.method, url: request.url }),
      // Response headers include Set-Cookie with the refresh token, so never log them.
      res: (response) => ({ statusCode: response.statusCode }),
    },
  }),
);

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'trainlead-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/trainer-profile', trainerProfileRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
    return;
  }
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