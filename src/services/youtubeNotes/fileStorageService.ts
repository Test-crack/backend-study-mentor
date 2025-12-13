/**
 * File Storage Service
 * Handles file system operations for caching study materials
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

// Base directory for uploads (cross-platform)
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const YOUTUBE_NOTES_DIR = path.join(UPLOADS_DIR, 'YOUTUBE_NOTES');

/**
 * Initialize storage directories
 * Creates necessary directories if they don't exist
 */
export async function initializeStorage(): Promise<void> {
  try {
    // Create uploads directory if it doesn't exist
    await mkdir(UPLOADS_DIR, { recursive: true });
    
    // Create YOUTUBE_NOTES directory if it doesn't exist
    await mkdir(YOUTUBE_NOTES_DIR, { recursive: true });
    
    console.log('[FileStorage] Storage directories initialized successfully');
  } catch (error: any) {
    console.error('[FileStorage] Failed to initialize storage directories:', error);
    throw new Error(`Storage initialization failed: ${error.message}`);
  }
}

/**
 * Generate a safe filename from video ID
 * Format: {videoId}.md
 */
function generateFileName(videoId: string): string {
  // Sanitize videoId to ensure it's safe for filesystem
  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${sanitized}.md`;
}

/**
 * Get the full file path for a video ID
 * Returns cross-platform compatible path
 */
export function getFilePath(videoId: string): string {
  const fileName = generateFileName(videoId);
  return path.join(YOUTUBE_NOTES_DIR, fileName);
}

/**
 * Get the relative path for database storage
 * Returns path relative to project root (cross-platform)
 */
export function getRelativePath(videoId: string): string {
  const fileName = generateFileName(videoId);
  // Use forward slashes for database storage (works on all platforms)
  return `uploads/YOUTUBE_NOTES/${fileName}`;
}

/**
 * Save study material to file system
 * @param videoId - YouTube video ID
 * @param markdown - Study material content in markdown format
 * @returns Relative path to the saved file
 */
export async function saveStudyMaterial(
  videoId: string,
  markdown: string
): Promise<string> {
  try {
    // Ensure directories exist
    await initializeStorage();
    
    const filePath = getFilePath(videoId);
    
    // Write markdown content to file
    await writeFile(filePath, markdown, 'utf-8');
    
    console.log(`[FileStorage] Study material saved: ${filePath}`);
    
    // Return relative path for database storage
    return getRelativePath(videoId);
  } catch (error: any) {
    console.error('[FileStorage] Failed to save study material:', error);
    throw new Error(`Failed to save study material: ${error.message}`);
  }
}

/**
 * Load study material from file system
 * @param relativePath - Relative path from database (e.g., "uploads/YOUTUBE_NOTES/abc123.md")
 * @returns Markdown content
 */
export async function loadStudyMaterial(relativePath: string): Promise<string> {
  try {
    // Convert relative path to absolute path (cross-platform)
    const absolutePath = path.join(process.cwd(), relativePath);
    
    // Check if file exists
    await access(absolutePath, fs.constants.R_OK);
    
    // Read file content
    const content = await readFile(absolutePath, 'utf-8');
    
    console.log(`[FileStorage] Study material loaded: ${absolutePath}`);
    
    return content;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Study material file not found');
    }
    console.error('[FileStorage] Failed to load study material:', error);
    throw new Error(`Failed to load study material: ${error.message}`);
  }
}

/**
 * Check if study material exists in file system
 * @param relativePath - Relative path from database
 * @returns true if file exists and is readable
 */
export async function studyMaterialExists(relativePath: string): Promise<boolean> {
  try {
    const absolutePath = path.join(process.cwd(), relativePath);
    await access(absolutePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
