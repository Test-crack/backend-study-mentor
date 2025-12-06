// src/routes/conceptRoutes.ts
import { Router, Request, Response } from 'express';
import { analyzeContentToConcept, ConceptAnalysisInput } from '../services/conceptService';

const router = Router();

/**
 * POST /api/concept/analyze
 * Test endpoint to analyze content and generate concept metadata
 * 
 * Body:
 * {
 *   "text": "Your content here...",
 *   "title": "Optional title",
 *   "sourceType": "pdf" | "youtube" | "note" | "text"
 * }
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { text, title, sourceType } = req.body;

    if (!text) {
      return res.status(400).json({ 
        error: 'Missing required field: text' 
      });
    }

    const input: ConceptAnalysisInput = {
      text,
      title,
      sourceType: sourceType || 'text'
    };

    console.log('[ConceptTest] Analyzing content...');
    const result = await analyzeContentToConcept(input);

    console.log('[ConceptTest] Analysis complete:', result);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Content analyzed successfully'
    });

  } catch (error: any) {
    console.error('[ConceptTest] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze content'
    });
  }
});

export default router;
