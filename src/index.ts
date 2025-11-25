import express, { Request, Response } from 'express';
import studyRoutes from './routes/studyRoutes';
import readingRoutes from './routes/readingRoutes';
import smartNotesRoutes from './routes/smartNotesRoutes';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());


// Define allowed origins
const allowedOrigins = [
  'http://localhost:8080',              // Dev client
  'https://myedtech.com',               // Production site
  'https://www.myedtech.com',           // Optional: www variant
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
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // enable if you plan to use cookies or JWT via headers
};

app.use(cors(corsOptions));
app.use(express.json());

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

// Test endpoint to verify logging
app.get('/test', (_req: Request, res: Response) => {
  console.log('[TEST] Test endpoint hit');
  res.json({ message: 'Test successful', timestamp: new Date().toISOString() });
});

app.use('/api/yt-study', studyRoutes);
app.use('/api/reading', readingRoutes);
app.use('/api/smartNotes', smartNotesRoutes);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${process.cwd()}/uploads`);
  console.log(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
});


