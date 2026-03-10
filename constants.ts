// Using Gemini 3 Flash Preview for multimodal capabilities (video processing) and text generation
export const GEMINI_MODEL_NAME = 'gemini-3-flash-preview';

export const MAX_FILE_SIZE_MB = 5120; // 5 GB
export const ACCEPTED_VIDEO_TYPES = "video/mp4,video/webm,video/quicktime";

export const PLAN_DETAILS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    features: ['Unlimited Videos', '5GB File Size', 'All Languages', 'No Watermark'],
    limits: {
      maxVideosPerMonth: 9999,
      maxFileSizeMB: 5120,
      allowExport: true,
      noWatermark: true,
      allLanguages: true,
      priorityProcessing: true
    }
  }
};

export const SAMPLE_VIDEOS = [
  {
    title: "Nature Walk",
    url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4" 
  }
];

export const SUPPORTED_LANGUAGES = [
  { code: 'hi', name: 'Hindi' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
];

export const CAPTION_LANGUAGES = [
  { code: 'hi_auto', name: 'Automatic speech-to-text (Hindi Priority)' },
  ...SUPPORTED_LANGUAGES
];

export const SOURCE_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  ...SUPPORTED_LANGUAGES
];