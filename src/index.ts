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
import iaRoutes from './routes/iaRoutes';
import { startWSServer } from './wsServer';

import { requireAuth } from './middleware/auth';
import { ensureUser } from './middleware/ensureUser';
import { initializeStorage } from './services/youtubeNotes/fileStorageService';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

app.use(express.json());


// Define allowed origins
const allowedOrigins = [
  'http://localhost:8080',              // Dev client
  'https://testcrack.com',               // Production site
  'https://www.testcrack.com',           // Optional: www variant
  'http://72.60.221.118:5000',   // Frontend served via VPS
];

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
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // enable if you plan to use cookies or JWT via headers
};

app.use(cors(corsOptions));
app.use(express.json());

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
app.use('/api/superadmin', superadminRoutes);
app.use('/api/institute-owner', instituteOwnerRoutes);
app.use('/api/institute-admin', instituteAdminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/reading-practice', readingPracticeRoutes);
app.use('/api/ielts-writing', ieltsWritingRoutes);
app.use('/api/drills', drillRoutes);
app.use('/api/diagnostic', requireAuth, ensureUser, diagnosticRoutes);
app.use('/api/ia',         requireAuth, ensureUser, iaRoutes);

// Initialize storage directories and start server
async function startServer() {
  try {
    // Initialize file storage
    await initializeStorage();
    console.log('✅ File storage initialized');

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


