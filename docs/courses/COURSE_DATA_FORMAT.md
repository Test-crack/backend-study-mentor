# Course Data Format Guide

This document explains the format needed to create course content.

---

## Course Structure Overview

```
Course
├── Module 1
│   ├── Concept 1.1
│   │   ├── Content Item (Notes)
│   │   ├── Content Item (MCQ)
│   │   └── Content Item (MCQ)
│   ├── Concept 1.2
│   │   ├── Content Item (Notes)
│   │   └── Content Item (MCQ)
│   └── ...
├── Module 2
│   ├── Concept 2.1
│   └── ...
└── ...
```

---

## 1. Course Details

| Field | Required | Description |
|-------|----------|-------------|
| title | Yes | Course name (max 500 chars) |
| description | No | Full course description |
| domain | Yes | Category (e.g., "Programming", "Data Science") |
| difficulty | No | BEGINNER, INTERMEDIATE, or ADVANCED |
| duration_minutes | No | Estimated total duration |
| price | No | Course price (e.g., 99.00) |

**Example:**
```
Title: Introduction to Python Programming
Description: Learn Python from scratch with hands-on examples
Domain: Programming
Difficulty: BEGINNER
Duration: 480 minutes (8 hours)
Price: 49.00
```

---

## 2. Modules

Each course has multiple modules in a specific order.

| Field | Required | Description |
|-------|----------|-------------|
| title | Yes | Module name (max 300 chars) |
| description | No | What this module covers |
| order_index | Yes | Position in course (0, 1, 2...) |

**Example:**
```
Module 1 (order: 0): Getting Started with Python
Module 2 (order: 1): Variables and Data Types
Module 3 (order: 2): Control Flow
Module 4 (order: 3): Functions
```

---

## 3. Concepts

Each module contains concepts (learning topics) in order.

| Field | Required | Description |
|-------|----------|-------------|
| conceptId | Yes | Unique ID (e.g., "python-variables-01") |
| learningObjective | Yes | What the learner will understand |
| keywords | No | Related terms for search |
| order_index | Yes | Position in module (0, 1, 2...) |

**Example:**
```
Concept 1 (order: 0): 
  ID: python-variables-01
  Objective: Understand how to declare and use variables in Python

Concept 2 (order: 1):
  ID: python-datatypes-01  
  Objective: Learn the basic data types: int, float, str, bool
```

---

## 4. Content Items

Each concept has content items. These are the actual learning materials.

### Content Types

| Type | Description |
|------|-------------|
| NOTES | Text/markdown content for reading |
| MCQ | Multiple choice question for practice |

### Notes Format

| Field | Required | Description |
|-------|----------|-------------|
| title | Yes | Content title (max 300 chars) |
| body | Yes | The actual content (markdown supported) |
| format | No | "markdown" (default) or "html" |
| is_required | No | Must complete to finish module? (default: yes) |
| sequence_order | Yes | Order within concept (0, 1, 2...) |

**Example:**
```
Title: What are Variables?
Format: markdown
Required: Yes
Sequence: 0
Body:
  # Variables in Python
  
  A variable is a container for storing data values.
  
  ## Creating Variables
  ```python
  name = "John"
  age = 25
  ```
```

### MCQ Format

| Field | Required | Description |
|-------|----------|-------------|
| title | Yes | Question title/topic |
| question | Yes | The actual question text |
| options | Yes | Array of 4 answer choices |
| correct_answer | Yes | The correct option (e.g., "A", "B", "C", "D") |
| explanation | No | Why this answer is correct |
| difficulty | No | "easy", "medium", "hard" |
| is_required | No | Must complete to finish module? (default: yes) |
| sequence_order | Yes | Order within concept (0, 1, 2...) |

**Example:**
```
Title: Variable Declaration Quiz
Question: Which of the following is a valid variable name in Python?
Options:
  A: my_variable
  B: 2ndVariable
  C: my-variable
  D: class
Correct Answer: A
Explanation: Variable names can contain letters, numbers, and underscores, but cannot start with a number or use reserved keywords.
Difficulty: easy
Required: Yes
Sequence: 1
```

---

## 5. Complete Example

```yaml
Course:
  title: Introduction to Python
  description: Learn Python programming from scratch
  domain: Programming
  difficulty: BEGINNER
  duration_minutes: 480

Modules:
  - title: Getting Started
    order: 0
    description: Setup and first steps
    
    Concepts:
      - id: python-intro-01
        objective: Understand what Python is and its uses
        order: 0
        
        Content:
          - type: NOTES
            title: What is Python?
            sequence: 0
            required: true
            body: |
              # What is Python?
              Python is a high-level programming language...
              
          - type: MCQ
            title: Python Basics Quiz
            sequence: 1
            required: true
            question: Python is a...?
            options: [High-level language, Low-level language, Markup language, Database]
            correct: A
            explanation: Python is a high-level, interpreted language.

      - id: python-setup-01
        objective: Install Python and set up development environment
        order: 1
        
        Content:
          - type: NOTES
            title: Installing Python
            sequence: 0
            required: true
            body: |
              # Installing Python
              Download from python.org...

  - title: Variables and Data Types
    order: 1
    description: Learn about storing data
    
    Concepts:
      - id: python-variables-01
        objective: Declare and use variables
        order: 0
        ...
```

---

## Data Submission Format

Please provide data in one of these formats:
- Excel/Google Sheets (one sheet per module)
- JSON/YAML file
- Structured Word document following the format above

### Recommended Spreadsheet Structure

**Sheet: Course Info**
| Field | Value |
|-------|-------|
| title | ... |
| description | ... |
| domain | ... |
| difficulty | ... |

**Sheet: Module 1 - [Module Name]**
| Concept ID | Concept Objective | Content Type | Title | Body/Question | Options | Correct | Explanation | Sequence | Required |
|------------|-------------------|--------------|-------|---------------|---------|---------|-------------|----------|----------|
| python-01 | Learn basics | NOTES | Intro | Content here... | | | | 0 | Yes |
| python-01 | Learn basics | MCQ | Quiz 1 | Question? | A,B,C,D | A | Because... | 1 | Yes |

---

## Questions?

Contact the development team if you need clarification on any format requirements.
