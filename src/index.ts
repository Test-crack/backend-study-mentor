import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import studyRoutes from './routes/studyRoutes.js';  // ← Add .js

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:8080',
    'https://platform.theblinkgrid.com',
    /\.vercel\.app$/,
    /\.theblinkgrid\.com$/
  ],
  credentials: true
}));

app.use(express.json());

app.get('/health', (req, res) => {
  console.log('✅ Health check hit');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/study', studyRoutes);

app.listen(PORT, '0.0.0.0', () => {  // ← Add 0.0.0.0
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;