import { ProgressStatus } from '@prisma/client';

export interface ProgressData {
  progress_percent: number;
  status: ProgressStatus;
  completed_items: number;
  total_required_items: number;
}

export interface ContentProgressResponse {
  message: string;
  data: {
    contentProgress: {
      status: ProgressStatus;
      completed_at: Date | null;
    };
    moduleProgress: ProgressData;
    courseProgress: ProgressData;
    moduleAdvanced: boolean;
    nextModuleIndex?: number;
  };
}

export interface ContentAccessResponse {
  message: string;
  data: {
    status: ProgressStatus;
    last_accessed_at: Date;
  };
}

export interface ResumeData {
  currentModuleIndex: number;
  courseStatus: ProgressStatus | null;
  moduleProgress: number;
  moduleStatus: ProgressStatus | null;
  // Furthest point in the module (by sequence order)
  furthestContentItemId: string | null;
  furthestContentStatus: string | null;
  // Last accessed content (for "continue where you left off")
  lastAccessedContentItemId: string | null;
  lastAccessedContentStatus: string | null;
  lastAccessedAt: Date | null;
}

export interface ResumeDataResponse {
  data: ResumeData;
}

export interface MarkContentCompletedResult {
  contentProgress: {
    id: string;
    user_id: string;
    content_item_id: string;
    course_id: string;
    module_id: string;
    status: string;
    completed_at: Date | null;
    last_accessed_at: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  moduleProgress: ProgressData;
  courseProgress: ProgressData;
  moduleAdvanced: boolean;
  nextModuleIndex?: number;
}

export interface ModuleProgressResult {
  moduleProgress: ProgressData;
  moduleUpdated: boolean;
}

export interface CourseProgressResult {
  courseProgress: ProgressData;
  courseUpdated: boolean;
  moduleAdvanced: boolean;
  nextModuleIndex?: number;
}
