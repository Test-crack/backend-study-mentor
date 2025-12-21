# Database Schema Design - Concept-Based Learning System

## Overview

This schema is designed to support a concept-based learning platform where content is organized by educational concepts, enabling:
- Content relationship mapping
- User learning progress tracking
- Personalized recommendations
- Curriculum sequencing
- Analytics and insights

---

## Core Models

### 1. **User**
Stores authenticated users from Supabase.

```prisma
model User {
  id             String   @id (UUID)
  supabaseuserid String   @unique
  email          String   @unique
  createdAt      DateTime
  updatedAt      DateTime
}
```

**Relations:**
- Has many `Content` (content they've created/uploaded)
- Has many `UserConceptProgress` (their learning progress)
- Has many `StudySession` (their study activity)

---

### 2. **Concept** ⭐ Core Model
Represents unique learning concepts extracted from content.

```prisma
model Concept {
  id                String   @id (UUID)
  conceptId         String   @unique    // BIOLOGY.PHOTOSYNTHESIS.001
  baseConceptId     String              // BIOLOGY.PHOTOSYNTHESIS
  domain            String              // biology, physics, math
  conceptSlug       String              // photosynthesis
  sequence          Int                 // 1, 2, 3... (auto-increment per base)
  keywords          String[]            // ["photosynthesis", "chlorophyll"]
  learningObjective String              // "Students will be able to..."
  description       String?             // Optional detailed description
}
```

**Key Fields:**
- `conceptId`: Unique identifier (e.g., `BIOLOGY.PHOTOSYNTHESIS.001`)
- `baseConceptId`: Groups related concepts (e.g., `BIOLOGY.PHOTOSYNTHESIS`)
- `sequence`: Auto-incremented number ensuring uniqueness
- `keywords`: Array for search and matching
- `learningObjective`: Educational goal statement

**Indexes:**
- `conceptId` (unique)
- `baseConceptId` + `sequence` (unique composite)
- `domain`, `conceptSlug`, `baseConceptId` (for queries)

**Use Cases:**
```typescript
// Find all variations of a concept
const concepts = await prisma.concept.findMany({
  where: { baseConceptId: 'BIOLOGY.PHOTOSYNTHESIS' }
});

// Search by domain
const biologyConcepts = await prisma.concept.findMany({
  where: { domain: 'biology' }
});

// Search by keywords
const concepts = await prisma.concept.findMany({
  where: {
    keywords: { has: 'photosynthesis' }
  }
});
```

---

### 3. **Content**
Stores actual learning materials linked to concepts.

```prisma
enum SourceType {
  PDF | YOUTUBE | NOTE | TEXT | ARTICLE | VIDEO
}

model Content {
  id          String     @id (UUID)
  conceptId   String     // Links to Concept
  userId      String     // Creator/uploader
  
  title       String
  sourceType  SourceType // PDF, YOUTUBE, NOTE, etc.
  sourceLink  String?    // URL or file path
  rawText     String?    // Extracted text content
  metadata    Json?      // Flexible additional data
  
  viewCount   Int        @default(0)
  likeCount   Int        @default(0)
  isPublic    Boolean    @default(false)
  isProcessed Boolean    @default(false)
}
```

**Key Fields:**
- `sourceType`: Enum defining content origin
- `sourceLink`: URL for YouTube, file path for PDFs, null for notes
- `rawText`: Extracted/processed text for analysis
- `metadata`: Flexible JSON for source-specific data
  ```json
  {
    "duration": 1200,           // For videos (seconds)
    "pageCount": 45,            // For PDFs
    "author": "John Doe",
    "publishedDate": "2024-01-15",
    "thumbnailUrl": "https://...",
    "language": "en"
  }
  ```

**Indexes:**
- `conceptId`, `userId`, `sourceType`, `isPublic`, `createdAt`

**Use Cases:**
```typescript
// Find all YouTube content for a concept
const videos = await prisma.content.findMany({
  where: {
    conceptId: conceptId,
    sourceType: 'YOUTUBE'
  }
});

// Find public content by user
const publicContent = await prisma.content.findMany({
  where: {
    userId: userId,
    isPublic: true
  },
  include: { concept: true }
});

// Get most viewed content for a domain
const popular = await prisma.content.findMany({
  where: {
    concept: { domain: 'biology' },
    isPublic: true
  },
  orderBy: { viewCount: 'desc' },
  take: 10
});
```

---

### 4. **ConceptRelation**
Defines relationships between concepts (prerequisites, related topics).

```prisma
model ConceptRelation {
  id            String   @id (UUID)
  fromConceptId String
  toConceptId   String
  relationType  String   // "prerequisite", "related", "advanced", "similar"
  strength      Float    // 0.0 to 1.0
}
```

**Relation Types:**
- `prerequisite`: Concept A must be learned before Concept B
- `related`: Concepts are related but not dependent
- `advanced`: Concept B is more advanced than Concept A
- `similar`: Concepts cover similar topics

**Use Cases:**
```typescript
// Find prerequisites for a concept
const prerequisites = await prisma.conceptRelation.findMany({
  where: {
    toConceptId: conceptId,
    relationType: 'prerequisite'
  },
  include: { fromConcept: true }
});

// Build learning path
const learningPath = await buildLearningPath('CALCULUS.DERIVATIVES');

// Find related concepts for recommendations
const related = await prisma.conceptRelation.findMany({
  where: {
    fromConceptId: conceptId,
    relationType: 'related',
    strength: { gte: 0.7 }
  },
  include: { toConcept: true }
});
```

---

### 5. **UserConceptProgress**
Tracks user mastery and engagement with concepts.

```prisma
model UserConceptProgress {
  id               String   @id (UUID)
  userId           String
  conceptId        String
  
  masteryLevel     Float    @default(0.0)  // 0.0 to 1.0
  timeSpentMinutes Int      @default(0)
  lastStudied      DateTime
  studyCount       Int      @default(0)
}
```

**Key Fields:**
- `masteryLevel`: 0.0 (beginner) to 1.0 (mastered)
- `timeSpentMinutes`: Total time spent on this concept
- `studyCount`: Number of study sessions

**Mastery Calculation:**
```typescript
// Update mastery based on study session
async function updateMastery(
  userId: string,
  conceptId: string,
  sessionScore: number,  // 0.0 to 1.0
  durationMinutes: number
) {
  const progress = await prisma.userConceptProgress.upsert({
    where: { userId_conceptId: { userId, conceptId } },
    update: {
      masteryLevel: {
        // Weighted average: 70% old, 30% new
        increment: (sessionScore - currentMastery) * 0.3
      },
      timeSpentMinutes: { increment: durationMinutes },
      studyCount: { increment: 1 },
      lastStudied: new Date()
    },
    create: {
      userId,
      conceptId,
      masteryLevel: sessionScore * 0.3,
      timeSpentMinutes: durationMinutes,
      studyCount: 1
    }
  });
}
```

**Use Cases:**
```typescript
// Get user's weak concepts
const weakConcepts = await prisma.userConceptProgress.findMany({
  where: {
    userId: userId,
    masteryLevel: { lt: 0.5 }
  },
  include: { concept: true },
  orderBy: { masteryLevel: 'asc' }
});

// Get learning statistics
const stats = await prisma.userConceptProgress.aggregate({
  where: { userId: userId },
  _avg: { masteryLevel: true },
  _sum: { timeSpentMinutes: true },
  _count: true
});

// Find concepts to review (studied long ago)
const needsReview = await prisma.userConceptProgress.findMany({
  where: {
    userId: userId,
    lastStudied: {
      lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    masteryLevel: { lt: 0.8 }
  }
});
```

---

### 6. **StudySession**
Tracks individual study sessions for analytics.

```prisma
model StudySession {
  id              String   @id (UUID)
  userId          String
  contentId       String
  
  startedAt       DateTime
  endedAt         DateTime?
  durationMinutes Int?
  completionRate  Float?   // 0.0 to 1.0
  notesCount      Int      @default(0)
}
```

**Use Cases:**
```typescript
// Start a study session
const session = await prisma.studySession.create({
  data: {
    userId: userId,
    contentId: contentId,
    startedAt: new Date()
  }
});

// End a study session
await prisma.studySession.update({
  where: { id: sessionId },
  data: {
    endedAt: new Date(),
    durationMinutes: calculateDuration(startedAt, new Date()),
    completionRate: 0.85,
    notesCount: 5
  }
});

// Get study analytics
const analytics = await prisma.studySession.groupBy({
  by: ['userId'],
  where: {
    startedAt: { gte: startOfWeek }
  },
  _sum: { durationMinutes: true },
  _count: true
});
```

---

## Data Flow Example

### 1. User Uploads YouTube Video

```typescript
// Step 1: Extract transcript and analyze
const transcript = await extractYouTubeTranscript(videoUrl);
const analysis = await analyzeContentToConcept({
  text: transcript,
  title: videoTitle,
  sourceType: 'youtube'
});

// Step 2: Check if concept exists
let concept = await prisma.concept.findFirst({
  where: { baseConceptId: analysis.baseConceptId }
});

// Step 3: Create or get next sequence
if (!concept) {
  concept = await prisma.concept.create({
    data: {
      conceptId: `${analysis.baseConceptId}.001`,
      baseConceptId: analysis.baseConceptId,
      domain: analysis.domain,
      conceptSlug: analysis.conceptSlug,
      sequence: 1,
      keywords: analysis.keywords,
      learningObjective: analysis.learningObjective
    }
  });
} else {
  // Get next sequence number
  const maxSeq = await prisma.concept.aggregate({
    where: { baseConceptId: analysis.baseConceptId },
    _max: { sequence: true }
  });
  
  const nextSeq = (maxSeq._max.sequence || 0) + 1;
  concept = await prisma.concept.create({
    data: {
      conceptId: `${analysis.baseConceptId}.${String(nextSeq).padStart(3, '0')}`,
      baseConceptId: analysis.baseConceptId,
      domain: analysis.domain,
      conceptSlug: analysis.conceptSlug,
      sequence: nextSeq,
      keywords: analysis.keywords,
      learningObjective: analysis.learningObjective
    }
  });
}

// Step 4: Create content record
const content = await prisma.content.create({
  data: {
    conceptId: concept.id,
    userId: userId,
    title: videoTitle,
    sourceType: 'YOUTUBE',
    sourceLink: videoUrl,
    rawText: transcript,
    metadata: {
      duration: videoDuration,
      thumbnailUrl: thumbnailUrl,
      channelName: channelName
    },
    isProcessed: true,
    isPublic: true
  }
});
```

### 2. User Studies Content

```typescript
// Start session
const session = await prisma.studySession.create({
  data: {
    userId: userId,
    contentId: contentId,
    startedAt: new Date()
  }
});

// ... user studies ...

// End session and update progress
await prisma.$transaction([
  // Update session
  prisma.studySession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      durationMinutes: 45,
      completionRate: 0.9
    }
  }),
  
  // Update concept progress
  prisma.userConceptProgress.upsert({
    where: {
      userId_conceptId: { userId, conceptId: content.conceptId }
    },
    update: {
      masteryLevel: { increment: 0.1 },
      timeSpentMinutes: { increment: 45 },
      studyCount: { increment: 1 },
      lastStudied: new Date()
    },
    create: {
      userId,
      conceptId: content.conceptId,
      masteryLevel: 0.3,
      timeSpentMinutes: 45,
      studyCount: 1
    }
  })
]);
```

---

## Indexes Strategy

**High-Priority Indexes:**
- `Concept.conceptId` (unique) - Primary lookups
- `Concept.baseConceptId` - Grouping related concepts
- `Content.conceptId` - Finding content for concepts
- `UserConceptProgress.userId` + `conceptId` (composite unique) - User progress lookups
- `StudySession.userId` + `startedAt` - Analytics queries

**Search Optimization:**
- `Concept.domain` - Domain filtering
- `Concept.keywords` (GIN index for arrays) - Keyword search
- `Content.sourceType` - Content type filtering
- `Content.isPublic` - Public content queries

---

## Migration Strategy

1. **Run Prisma migration:**
```bash
npx prisma migrate dev --name add_concept_system
```

2. **Generate Prisma client:**
```bash
npx prisma generate
```

3. **Seed initial data (optional):**
```typescript
// prisma/seed.ts
const domains = ['biology', 'physics', 'chemistry', 'math', 'computer-science'];
// Create sample concepts for testing
```

---

## Future Enhancements

1. **Full-text search:** Add PostgreSQL full-text search on `Content.rawText`
2. **Tags system:** Add many-to-many tags for flexible categorization
3. **Assessments:** Add quiz/test models linked to concepts
4. **Learning paths:** Add curated learning path models
5. **Collaboration:** Add sharing and collaboration features
6. **Notifications:** Add notification system for study reminders
7. **Achievements:** Add gamification with badges and achievements

---

## Performance Considerations

1. **Pagination:** Always use cursor-based pagination for large datasets
2. **Caching:** Cache frequently accessed concepts and content
3. **Batch operations:** Use `createMany` and transactions for bulk operations
4. **Lazy loading:** Use `include` selectively to avoid over-fetching
5. **Aggregations:** Use database aggregations instead of fetching all records

---

## Security Notes

1. **Row-level security:** Implement authorization checks in API layer
2. **Public content:** Always filter by `isPublic` for non-owners
3. **User isolation:** Ensure users can only access their own progress data
4. **Input validation:** Validate all user inputs before database operations
5. **Rate limiting:** Implement rate limiting on content creation endpoints
