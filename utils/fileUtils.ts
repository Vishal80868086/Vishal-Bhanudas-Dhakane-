import { CaptionSegment } from '../types';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/mp4;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const parseSRT = (srt: string): CaptionSegment[] => {
  const segments: CaptionSegment[] = [];
  // Normalize line endings
  const normalized = srt.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');

  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const id = parseInt(lines[0]);
      const timeLine = lines[1];
      const text = lines.slice(2).join(' '); // Join remaining lines as text
      
      const [start, end] = timeLine.split(' --> ');
      
      if (!isNaN(id) && start && end) {
        segments.push({
          id,
          startTime: start.trim(),
          endTime: end.trim(),
          text: text.trim()
        });
      }
    }
  });

  return segments;
};

export const generateSRT = (segments: CaptionSegment[]): string => {
  return segments.map(s => {
    return `${s.id}\n${s.startTime} --> ${s.endTime}\n${s.text}`;
  }).join('\n\n');
};

export const downloadTextFile = (content: string, filename: string) => {
  const element = document.createElement("a");
  const file = new Blob([content], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};