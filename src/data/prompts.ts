// ===== YOUTUBE TRANSCRIPT SUMMARIZATION PROMPT =====

export const YOUTUBE_TRANSCRIPT_PROMPT = `You are an expert educational content creator. Create a comprehensive study material from the given YouTube transcript.

Structure the output as follows:

### **Overview**
[Brief summary – 2–3 sentences about what the video covers]

---

### **Concept 1: [Topic Name]**
**Timestamp:** [MM:SS]

- Main Point 1
- Main Point 2
- Main Point 3

**Why This Matters:** [Explanation of importance and relevance]

---

### **Concept 2: [Topic Name]**
**Timestamp:** [MM:SS]

- Main Point 1
- Main Point 2
- Main Point 3

**Key Takeaway:** [Summary of this concept]

---

[Continue with more concepts as needed]

### **Summary**
[Overall summary of the entire content - 3-4 sentences]

### **Study Tips**
- [Practical tip 1]
- [Practical tip 2]
- [Practical tip 3]

### **Further Exploration**
- [Related topic 1]
- [Related topic 2]
- [Additional resources or concepts to explore]

---

**Instructions:**
1. Divide content into logical sections/topics based on the transcript
2. Add clear topic headings that describe each concept
3. Highlight key concepts and important details
4. Use bullet points for important details
5. Include timestamps for each major concept (format as MM:SS)
6. Provide "Why This Matters" or "Key Takeaway" for each concept
7. Make it study-friendly with clear structure and actionable insights
8. Use only Markdown syntax, no code blocks or special formatting`;

// ===== CONCEPT METADATA EXTRACTION PROMPT =====

export const CONCEPT_METADATA_EXTRACTION_PROMPT = `

**ADDITIONAL TASK - CONCEPT METADATA EXTRACTION:**

After generating the study material, you MUST also extract concept metadata. At the very end of your response, add a JSON block with the following structure:

\`\`\`json
{
  "domain": "string (e.g., 'science', 'math', 'engineering', 'business', 'computer-science')",
  "subConcept": "string (2-5 words describing the main concept, e.g., 'hybrid-power-systems', 'neural-networks')",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "importantKeywords": ["term1", "term2", "term3"],
  "criticalKeywords": ["critical1", "critical2"],
  "learningObjective": "Students will be able to..."
}
\`\`\`

**KEYWORD HIGHLIGHTING INSTRUCTIONS:**
- **keywords**: 5-8 general keywords from the content
- **importantKeywords**: 3-5 terms that are IMPORTANT for understanding (will be highlighted in yellow)
- **criticalKeywords**: 2-3 terms that are CRITICAL/ESSENTIAL concepts (will be highlighted in orange/red)

**RULES:**
1. Focus on HIGH-LEVEL conceptual grouping
2. Domain should be a single word or hyphenated
3. Sub-concept should be short but meaningful (2-5 words)
4. Learning objective must start with "Students will be able to..."
5. Separate important vs critical keywords carefully
6. The JSON block MUST be at the very end, after all the markdown content
`;

// ===== STUDY MATERIAL GENERATION PROMPTS =====

export type MaterialType = "overview" | "standard" | "detailed" | "quiz";

export const MATERIAL_PROMPTS: Record<MaterialType, string> = {
  overview: `You are an expert educational content creator. Create a QUICK OVERVIEW from the given study material.

Structure the output as follows:

### **Quick Overview**

**Main Topic:** [What is this content about?]

**Key Points:**
- [Most important point 1]
- [Most important point 2]
- [Most important point 3]
- [Most important point 4]
- [Most important point 5]

**In a Nutshell:**
[2-3 sentence summary of the entire content]

**Estimated Study Time:** [X minutes]

---

**Instructions:**
1. Keep it concise and focused on the essentials
2. Extract only the most critical information
3. Use clear, simple language
4. Make it scannable with bullet points
5. Use only Markdown syntax, no code blocks`,

  standard: `You are an expert educational content creator. Create STANDARD STUDY NOTES from the given material.

Structure the output as follows:

### **Overview**
[Brief summary – 2–3 sentences about what the content covers]

---

### **Topic 1: [Topic Name]**

**Key Concepts:**
- [Concept 1]
- [Concept 2]
- [Concept 3]

**Important Details:**
- [Detail 1]
- [Detail 2]

**Why This Matters:** [Explanation of importance]

---

### **Topic 2: [Topic Name]**

**Key Concepts:**
- [Concept 1]
- [Concept 2]

**Examples:**
- [Example 1]
- [Example 2]

**Key Takeaway:** [Summary of this topic]

---

[Continue with more topics as needed]

### **Summary**
[Overall summary of the entire content - 3-4 sentences]

### **Study Tips**
- [Practical tip 1]
- [Practical tip 2]
- [Practical tip 3]

---

**Instructions:**
1. Divide content into logical sections/topics
2. Add clear topic headings
3. Highlight key concepts and important details
4. Use bullet points for clarity
5. Provide context and explanations
6. Make it study-friendly with clear structure
7. Use only Markdown syntax, no code blocks`,

  detailed: `You are an expert educational content creator. Create DETAILED COMPREHENSIVE NOTES from the given material.

Structure the output as follows:

### **Introduction**
[Comprehensive introduction explaining the context and scope of the material]

---

### **Section 1: [Topic Name]**

#### **Core Concepts**
- **[Concept 1]:** [Detailed explanation]
- **[Concept 2]:** [Detailed explanation]
- **[Concept 3]:** [Detailed explanation]

#### **In-Depth Analysis**
[Detailed paragraph explaining the topic thoroughly, including context, relationships, and implications]

#### **Examples & Applications**
1. **Example 1:** [Detailed example with explanation]
2. **Example 2:** [Detailed example with explanation]

#### **Common Misconceptions**
- [Misconception 1 and clarification]
- [Misconception 2 and clarification]

#### **Key Takeaways**
- [Important point 1]
- [Important point 2]

---

### **Section 2: [Topic Name]**

[Follow same structure as Section 1]

---

[Continue with more sections as needed]

### **Comprehensive Summary**
[Detailed summary tying all concepts together - 5-6 sentences]

### **Study Strategy**
1. [Detailed study approach 1]
2. [Detailed study approach 2]
3. [Detailed study approach 3]

### **Practice Questions**
1. [Thought-provoking question 1]
2. [Thought-provoking question 2]
3. [Thought-provoking question 3]

### **Further Exploration**
- [Advanced topic 1 to explore]
- [Advanced topic 2 to explore]
- [Related concepts to study]

---

**Instructions:**
1. Provide comprehensive, in-depth explanations
2. Include detailed examples and applications
3. Explain the "why" behind concepts
4. Address common misconceptions
5. Create connections between topics
6. Make it thorough and academically rigorous
7. Use only Markdown syntax, no code blocks`,

  quiz: `You are an expert educational content creator. Create a QUICK QUIZ from the given study material.

Structure the output as follows:

### **Quick Quiz**

**Instructions:** Answer the following questions to test your understanding.

---

#### **Question 1**
[Clear, specific question]

**Options:**
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]

<details>
<summary><strong>Show Answer</strong></summary>

**Correct Answer:** [Letter]

**Explanation:** [Brief explanation of why this is correct and why others are wrong]

</details>

---

#### **Question 2**
[Clear, specific question]

**Options:**
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]

<details>
<summary><strong>Show Answer</strong></summary>

**Correct Answer:** [Letter]

**Explanation:** [Brief explanation]

</details>

---

[Continue with 8-10 questions total]

### **Quiz Summary**

**Topics Covered:**
- [Topic 1]
- [Topic 2]
- [Topic 3]

**Study Tip:** [One helpful tip for mastering this material]

---

**Instructions:**
1. Create 8-10 multiple choice questions
2. Cover all major topics from the material
3. Make questions clear and unambiguous
4. Provide 4 options (A, B, C, D) for each question
5. Include correct answer and explanation in collapsible section
6. Mix difficulty levels (easy, medium, hard)
7. Focus on understanding, not just memorization
8. Use only Markdown syntax with HTML details tags for answers`,
};
