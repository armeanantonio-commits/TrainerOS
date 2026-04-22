import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

// Load environment variables
dotenv.config();

// Routes
import authRoutes from './routes/auth.routes.js';
import nicheRoutes from './routes/niche.routes.js';
import ideaRoutes from './routes/idea.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import statsRoutes from './routes/stats.routes.js';
import promoRoutes from './routes/promo.routes.js';
import adminRoutes from './routes/admin.routes.js';
import chatRoutes from './routes/chat.routes.js';
import emailRoutes from './routes/email.routes.js';
import nutritionRoutes from './routes/nutrition.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });

if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

// Create uploads directory
const uploadsDir = process.env.UPLOAD_DIR || './uploads';
try {
  mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn('Could not create uploads directory:', err);
}

// Middleware
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,https://traineros.org')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isPrivateNetworkDevOrigin = (origin: string) => {
  return /^http:\/\/(?:127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$/i.test(origin);
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server and health checks with no browser Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const isTrainerOsSubdomain = /^https:\/\/([a-z0-9-]+\.)?traineros\.org$/i.test(origin);
    const isLocalhostDev = /^http:\/\/localhost:\d+$/i.test(origin);
    const isPrivateNetworkDev = isPrivateNetworkDevOrigin(origin);

    if (isTrainerOsSubdomain || isLocalhostDev || isPrivateNetworkDev) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Stripe webhook needs raw body for signature verification.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') {
    next();
    return;
  }
  jsonParser(req, res, next);
});

app.use((req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') {
    next();
    return;
  }
  urlencodedParser(req, res, next);
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/niche', nicheRoutes);
app.use('/api/idea', ideaRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/nutrition', nutritionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const maxFileSizeBytes = parseInt(process.env.MAX_FILE_SIZE || '524288000');
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      details: `Max upload size is ${(maxFileSizeBytes / 1024 / 1024).toFixed(0)}MB.`,
    });
  }

  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 TrainerOS Backend Server Started!
    
📍 Server running on: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/health
📚 API endpoints:
   - POST /api/auth/register
   - POST /api/auth/login
   - GET  /api/auth/me
   - POST /api/niche/generate/quick
   - POST /api/niche/generate/wizard
   - POST /api/idea/generate
   - GET  /api/idea/history
   - POST /api/feedback/analyze
   - GET  /api/feedback/history

Environment: ${process.env.NODE_ENV || 'development'}
CORS Origins: ${(process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')}
  `);
});

export default app;
