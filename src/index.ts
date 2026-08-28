import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import ytStudyRoutes from './routes/ytStudyRoutes';
import readingRoutes from './routes/readingRoutes';
import smartNotesRoutes from './routes/smartNotesRoutes';
import conceptRoutes from './routes/conceptRoutes';
import userProfileRoutes from './routes/userProfileRoutes';
import cors from 'cors';
import coursesRoutes from './routes/courseRoutes';
import instructorRoutes from './routes/instructorRoutes';
import domainRoutes from './routes/domainRoutes';
import ieltsReadingRoutes from './routes/ieltsReadingRoutes';
import voiceLabRoutes from './routes/voiceLabRoutes';
import superadminRoutes from './routes/superadminRoutes';
import instituteOwnerRoutes from './routes/instituteOwnerRoutes';
import instituteAdminRoutes from './routes/instituteAdminRoutes';
import studentRoutes from './routes/studentRoutes';
import readingPracticeRoutes from './routes/readingPracticeRoutes';
import ieltsWritingRoutes from './routes/ieltsWritingRoutes';
import drillRoutes from './routes/drillRoutes';
import diagnosticRoutes from './routes/diagnosticRoutes';
import iaRoutes   from './routes/iaRoutes';
import mockRoutes from './routes/mockRoutes';
import examsRoutes from './routes/examsRoutes';
import { startWSServer } from './wsServer';

import { requireAuth } from './middleware/auth';
import { ensureUser } from './middleware/ensureUser';
import { requireDiagnosed } from './middleware/requireDiagnosed';
import { initializeStorage } from './services/youtubeNotes/fileStorageService';
import { loadExamEngine } from './exam-engine';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Body size raised to 50 MB — diagnostic/mock speaking submissions include
// base64-encoded audio which easily exceeds the default 100 kb limit.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Allowed origins: configure via ALLOWED_ORIGINS env var (comma-separated).
// The default covers localhost, both prod and dev subdomains, and the VPS IP.
const ORIGINS_DEFAULT = 'http://localhost:8080,https://testcrack.com,https://www.testcrack.com,https://dev.testcrack.com,http://72.60.221.118:5000';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? ORIGINS_DEFAULT)
  .split(',').map(s => s.trim()).filter(Boolean);

// Dynamic CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    console.log(`[CORS] Request from origin: ${origin || 'no origin'}`);
    if (!origin || allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Origin allowed`);
      callback(null, true); // Allow request
    } else {
      console.log(`[CORS] ❌ Origin blocked`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Exam-Id'], // X-Exam-Id: owner/admin exam context (A1c)
  credentials: true, // enable if you plan to use cookies or JWT via headers
};

app.use(cors(corsOptions));

// ── Static: IA audio files ────────────────────────────────────────────────────
// DB stores audio_url as "/ia/audio/filename.mp3".
// Files live at  src/data/ia/audio/filename.mp3.
// Mounted at /ia so that GET /ia/audio/filename.mp3 resolves without auth.
app.use(
  '/ia',
  express.static(path.join(__dirname, '../data/ia'), {
    maxAge: '7d',          // cache in browser for 7 days
    immutable: true,       // safe: filenames embed difficulty/number
  })
);

// Request logging middleware
app.use((req: Request, _res: Response, next: any) => {
  console.log(`\n========== INCOMING REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`Headers:`, req.headers);
  console.log(`Body:`, req.body);
  console.log(`======================================\n`);
  next();
});

app.get('/', (_req: Request, res: Response) => {
  console.log('[ROOT] Root endpoint hit');
  res.send('Study Material Generator Backend - Running');
});

// Liveness check for the deploy pipeline — deliberately shallow (no DB check).
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});


app.use('/api/yt-study', requireAuth, ensureUser, ytStudyRoutes);
app.use('/api/reading', requireAuth, ensureUser, readingRoutes);
app.use('/api/smartNotes', smartNotesRoutes);
app.use('/api/concept', conceptRoutes); // Test endpoint - remove later
app.use('/api/profile', requireAuth, ensureUser, userProfileRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/ielts-reading', ieltsReadingRoutes);
app.use('/api/voice-lab', voiceLabRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/institute-owner', instituteOwnerRoutes);
app.use('/api/institute-admin', instituteAdminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/reading-practice', readingPracticeRoutes);
app.use('/api/ielts-writing', ieltsWritingRoutes);
app.use('/api/drills', drillRoutes);
app.use('/api/diagnostic', requireAuth, ensureUser, diagnosticRoutes);
app.use('/api/ia',         requireAuth, ensureUser, requireDiagnosed, iaRoutes);
app.use('/api/mock',       requireAuth, ensureUser, requireDiagnosed, mockRoutes);

// Initialize storage directories and start server
async function startServer() {
  try {
    // Initialize file storage
    await initializeStorage();
    console.log('✅ File storage initialized');

    // Load + validate the exam-engine config. Throws on an invalid config →
    // startServer's catch exits the process (fail loud). See Phase 5 · B1/B2.
    await loadExamEngine();

    // Start WebSocket server sharing the HTTP server
    startWSServer(server);

    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📁 Upload directory: ${process.cwd()}/uploads`);
      console.log(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();


