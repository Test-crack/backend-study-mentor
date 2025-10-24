import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import studyRoutes from './routes/studyRoutes.js';

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

// YouTube study routes
app.use('/api/study', studyRoutes);

// Proxy for reading assessment (temporary fix for CORS)
app.all('/api/reading/*', async (req, res) => {
  try {
    const targetUrl = `https://study-material-backend.fly.dev${req.originalUrl}`;
    console.log(`📡 Proxying request to: ${targetUrl}`);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy error:', errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy request', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;