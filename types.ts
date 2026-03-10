export interface CaptionSegment {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface TopicInsight {
  topic: string;
  relevance: number; // 0-100
}

export interface AnalysisResult {
  srt: string;
  topics: TopicInsight[];
  summary: string;
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface VideoFile {
  file: File;
  previewUrl: string;
  base64?: string;
  mimeType: string;
}

export type PlanType = 'free' | 'monthly' | 'yearly';

export interface SubscriptionPlan {
  id: PlanType;
  name: string;
  price: number;
  currency: string;
  features: string[];
  limits: {
    maxVideosPerMonth: number;
    maxFileSizeMB: number;
    allowExport: boolean;
    noWatermark: boolean;
    allLanguages: boolean;
    priorityProcessing: boolean;
  };
}

export interface UserSubscription {
  planId: PlanType;
  startDate: string;
  videosUsedThisMonth: number;
  lastResetDate: string;
}
