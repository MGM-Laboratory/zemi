import 'reflect-metadata';
import { Logger, RequestMethod, VersioningType, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/exception.filter.js';
import { configureFfmpeg } from './common/ffmpeg.js';
import { configureClientIp } from './common/request.js';
import { AppConfig, loadConfig } from './config/app-config.js';
import { ConfigError } from './config/env.js';
import { runMigrations } from './db/migrate.js';

/** Paths that are streamed (never compressed): media files, HLS, SSE. */
const STREAM_PATHS = [/^\/media\//, /^\/api\/v1\/public\/live\//];
/** GET-only public resources any origin may read without credentials. */
const PUBLIC_READ_PATHS = [/^\/media\//, /^\/api\/v1\/public\//];

const ALLOWED_HEADERS = ['content-type', 'x-zemi-csrf', 'range', 'if-none-match', 'if-modified-since', 'last-event-id', 'accept'];
const EXPOSED_HEADERS = ['content-range', 'accept-ranges', 'content-length', 'etag', 'retry-after', 'content-disposition'];

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // Fail fast with every problem listed, before anything else starts.
      console.error(`\n${err.message}\n\nSee apps/api/.env.example for the full list.\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  const logger = new Logger('Bootstrap');
  configureFfmpeg({ ffmpeg: config.env.FFMPEG_PATH, ffprobe: config.env.FFPROBE_PATH });
  configureClientIp(config.env.CLIENT_IP_HEADER);

  // Migrations run before Nest boots, so every provider (and pg-boss) sees the final schema.
  if (config.env.MIGRATE_ON_BOOT) await runMigrations(config.env.DATABASE_URL);

  const logLevels: LogLevel[] = config.isProduction ? ['log', 'warn', 'error', 'fatal'] : ['log', 'warn', 'error', 'fatal', 'debug'];
  // bodyParser: false, or Nest adds its default urlencoded parser next to ours (see below).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: logLevels, bodyParser: false });

  // Railway (and the Next rewrite) sit in front of us: honour X-Forwarded-* for req.ip / protocol.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // JSON bodies are small. Multipart uploads are handled per route by multer (disk storage, 4 GB).
  // No urlencoded parser: no route takes HTML form posts, and without it a cross-site <form> can't
  // drive any endpoint (login CSRF included; /auth/login also answers 415 to anything but JSON).
  app.useBodyParser('json', { limit: '2mb' });
  app.use(cookieParser());

  app.use(
    helmet({
      // Media, HLS and SSE are read cross-origin by the web app; CORS still decides who may read JSON.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      // The API serves JSON and media, not documents. CSP would only break Swagger UI and PDF viewers.
      contentSecurityPolicy: false,
      hsts: config.isProduction ? undefined : false,
    }),
  );

  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (STREAM_PATHS.some((re) => re.test(req.path))) return false;
        if (String(req.headers.accept ?? '').includes('text/event-stream')) return false;
        if (String(res.getHeader('Content-Type') ?? '').includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );

  const allowedOrigins = new Set(config.corsOrigins);
  app.enableCors((req: Request, cb) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      return cb(null, {
        origin,
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        maxAge: 600,
      });
    }
    const method = req.method.toUpperCase();
    const readOnly = method === 'GET' || method === 'HEAD' || (method === 'OPTIONS' && /^(GET|HEAD)$/i.test(String(req.headers['access-control-request-method'] ?? '')));
    if (readOnly && PUBLIC_READ_PATHS.some((re) => re.test(req.path))) {
      return cb(null, {
        origin: '*',
        credentials: false,
        methods: ['GET', 'HEAD', 'OPTIONS'],
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        maxAge: 86_400,
      });
    }
    return cb(null, { origin: false });
  });

  // Routes are /api/v1/..., except /media/* which lives at the root (version neutral).
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'media/{*path}', method: RequestMethod.GET },
      { path: 'media/{*path}', method: RequestMethod.HEAD },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Zemi API')
        .setDescription('Weekly Friday research seminar. Validation is zod (see @zemi/shared), so bodies are not described here.')
        .setVersion('1.0')
        .addCookieAuth('zemi_session')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  // Force-exit if graceful shutdown hangs (open sockets, stuck jobs). Railway sends SIGKILL at ~30s anyway.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      setTimeout(() => {
        logger.warn('Shutdown took too long, exiting.');
        process.exit(0);
      }, 25_000).unref();
    });
  }

  // "::" listens on IPv6 and IPv4, which Railway private networking needs.
  await app.listen(config.env.PORT, config.env.HOST);
  logger.log(`Zemi API on http://localhost:${config.env.PORT}/api/v1 (${config.env.NODE_ENV})`);
  if (config.swaggerEnabled) logger.log(`Swagger UI on http://localhost:${config.env.PORT}/api/docs`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
