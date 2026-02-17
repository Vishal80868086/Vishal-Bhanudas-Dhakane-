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