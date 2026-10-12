import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { connectDB, sequelize } from './config/database.js';
import { swaggerUi, swaggerSpec, swaggerUiOptions } from './config/swagger.js';
import apiRoutes from './routes/index.js';
import { razorpayWebhook, woocommerceWebhook, atvSiteWebhook } from './controllers/webhookController.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import { UPLOAD_ROOT } from './middlewares/upload.js';
import { initSocket } from './services/socketService.js';
import { startScheduler } from './services/schedulerService.js';

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.set('trust proxy', 1);

// ==========================================
// Global Middlewares
// ==========================================

// Security headers; cross-origin resource policy allows the SPA to load media.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
  })
);

const allowedOrigins = [
  ...(process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((o) => o.trim()),
  ...(NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:5173'] : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (mobile apps, curl, Postman) and whitelisted origins.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'Content-Range', 'Accept-Ranges']
};
app.use(cors(corsOptions));

app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// Razorpay webhook needs the raw body for signature verification - mount before JSON parsing.
app.post('/api/v1/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), razorpayWebhook);
// WooCommerce order webhooks (server-to-server from antarikshtv.com, HMAC-signed): same raw-body requirement.
app.post('/api/v1/webhooks/woocommerce', express.raw({ type: '*/*', limit: '2mb' }), woocommerceWebhook);
// Paid orders pushed by the antarikshtv.com checkout (HMAC-signed, raw body).
app.post('/api/v1/webhooks/atv-site', express.raw({ type: '*/*', limit: '1mb' }), atvSiteWebhook);

// Compression is skipped for video streams (range responses).
app.use(compression({ filter: (req, res) => !req.path.includes('/media/videos/') && compression.filter(req, res) }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Only images (avatars, thumbnails, category & CMS images, community attachments)
// are public. Videos, course documents, project files and reports are served
// through access-checked API endpoints.
app.use('/uploads/images', express.static(path.join(UPLOAD_ROOT, 'images'), { maxAge: '7d', index: false }));

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.API_RATE_LIMIT || 2000),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.includes('/media/videos/'),
    message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' }
  })
);

// ==========================================
// Base Routes & Health Check
// ==========================================

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'ATV Academy LMS API',
    description: 'Production-Level Learning Management System Backend (Student • Tutor • Admin)',
    version: '2.0.0',
    environment: NODE_ENV,
    endpoints: {
      health: '/health',
      apiBase: '/api/v1',
      docs: '/api-docs',
      openapi: '/api-docs.json'
    }
  });
});

app.get(['/health', '/api/health'], async (req, res) => {
  let dbStatus = 'connected';
  try {
    await sequelize.authenticate();
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: { status: dbStatus, dialect: 'mysql', database: process.env.DB_NAME || 'lms_db' }
  });
});

// ==========================================
// API Documentation (Swagger UI & OpenAPI 3.0)
// ==========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
app.get(['/docs', '/api/docs'], (req, res) => res.redirect('/api-docs'));

app.use('/api/v1', apiRoutes);

// ==========================================
// Error Handling
// ==========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ==========================================
// Server Initialization & Graceful Shutdown
// ==========================================

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server, allowedOrigins);
  startScheduler();

  server.listen(PORT, () => {
    console.log('=========================================');
    console.log(' ATV Academy LMS Server running');
    console.log(` Environment: ${NODE_ENV}`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Health: http://localhost:${PORT}/health`);
    console.log(` API v1: http://localhost:${PORT}/api/v1`);
    console.log(` Swagger Docs: http://localhost:${PORT}/api-docs`);
    console.log(` OpenAPI Spec: http://localhost:${PORT}/api-docs.json`);
    console.log('=========================================');
  });

  const shutdown = (signal) => {
    console.log(`\n[Server]: Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      try {
        await sequelize.close();
      } catch (err) {
        console.error('[Database]: Error during disconnect:', err.message);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('[Server]: Failed to start application:', error);
    process.exit(1);
  });
}

export default app;
