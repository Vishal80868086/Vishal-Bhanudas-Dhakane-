import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnalysisResult, CaptionSegment } from '../types';
import { parseSRT, generateSRT, downloadTextFile } from '../utils/fileUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

// Add missing types for WebCodecs API
declare global {
  class AudioEncoder {
    constructor(init: { output: (chunk: any, meta: any) => void; error: (e: any) => void });
    configure(config: { codec: string; numberOfChannels: number; sampleRate: number; bitrate?: number }): void;
    encode(data: AudioData): void;
    flush(): Promise<void>;
    close(): void;
  }

  class AudioData {
    constructor(init: {
      format: string;
      sampleRate: number;
      numberOfFrames: number;
      numberOfChannels: number;
      timestamp: number;
      data: BufferSource | Float32Array;
    });
    close(): void;
    duration: number; // in microseconds
  }
}

interface ResultsViewProps {
  result: AnalysisResult;
  videoUrl: string;
  targetLangName: string;
}

const FONTS = [
  { name: 'Inter (Default)', value: 'Inter' },
  { name: 'Mukta (Devanagari)', value: 'Mukta' },
  { name: 'Tiro Devanagari Hindi', value: 'Tiro Devanagari Hindi' },
  { name: 'Poppins', value: 'Poppins' },
  { name: 'Sans Serif', value: 'sans-serif' },
];

const POSITIONS = [
  { name: 'Bottom', value: 'bottom' },
  { name: 'Top', value: 'top' },
  { name: 'Custom', value: 'custom' },
];

const ANIMATIONS = [
  { name: 'None', value: 'none' },
  { name: 'Fade In', value: 'fade' },
  { name: 'Slide Up', value: 'slide' },
  { name: 'Pop In', value: 'pop' },
  { name: 'Bounce', value: 'bounce' },
  { name: 'Glow', value: 'glow' },
  { name: 'Shake', value: 'shake' },
];

// Helper to parse SRT timestamps (00:00:05,123) to seconds
const parseTime = (timeString: string): number => {
  if (!timeString) return 0;
  // Handle comma or dot decimal separator
  const parts = timeString.replace(',', '.').split(':');
  if (parts.length < 3) return 0;
  const h = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  const s = parseFloat(parts[2]);
  return (h * 3600) + (m * 60) + s;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getRgbaColor = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
};

const ResultsView: React.FC<ResultsViewProps> = ({ result, videoUrl, targetLangName }) => {
  const [activeTab, setActiveTab] = useState<'captions' | 'insights'>('captions');
  
  // Editable Captions State
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);

  // Appearance State
  const [selectedFont, setSelectedFont] = useState<string>('Inter');
  const [fontSize, setFontSize] = useState<number>(5); // Percentage of video height
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [captionPosition, setCaptionPosition] = useState<'top' | 'bottom' | 'custom'>('bottom');
  const [captionY, setCaptionY] = useState<number>(90); // Percentage 0-100
  const [selectedAnimation, setSelectedAnimation] = useState<string>('none');
  const [visualMaxWords, setVisualMaxWords] = useState<number>(100); // Default to unlimited (high number)
  
  // Background State
  const [showBackground, setShowBackground] = useState<boolean>(true);
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(70); // 0-100

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("Preparing...");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null); // Hidden canvas for recording
  const textLayoutCache = useRef<{ [key: number]: string[] }>({}); // Cache for wrapped text lines
  
  // Waveform State
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isWaveformReady, setIsWaveformReady] = useState(false);

  // Initialize captions from result
  useEffect(() => {
    if (result.srt) {
      setCaptions(parseSRT(result.srt));
      textLayoutCache.current = {}; // Clear cache on new captions
    }
  }, [result.srt]);

  // Invalidate cache when appearance changes to ensure correct wrapping on next export
  useEffect(() => {
    textLayoutCache.current = {};
  }, [selectedFont, fontSize, visualMaxWords]);

  const handleCaptionChange = (id: number, newText: string) => {
    setCaptions(prev => prev.map(c => c.id === id ? { ...c, text: newText } : c));
    delete textLayoutCache.current[id]; // Invalidate cache for this caption
  };

  const handlePositionChange = (pos: 'top' | 'bottom' | 'custom') => {
    setCaptionPosition(pos);
    if (pos === 'top') setCaptionY(10);
    if (pos === 'bottom') setCaptionY(90);
  };

  // Pre-calculate numeric times for efficient lookup during playback
  const numericCaptions = useMemo(() => {
    return captions.map(c => ({
      ...c,
      start: parseTime(c.startTime),
      end: parseTime(c.endTime)
    }));
  }, [captions]);

  // Find the currently active caption based on video time
  const activeCaption = useMemo(() => {
    return numericCaptions.find(c => currentTime >= c.start && currentTime <= c.end);
  }, [currentTime, numericCaptions]);

  // Create a Blob URL for the VTT track (updated to reflect edited captions)
  const vttUrl = useMemo(() => {
    if (captions.length === 0) return undefined;
    try {
      const vttBody = captions.map(c => {
         return `${c.startTime.replace(',', '.')} --> ${c.endTime.replace(',', '.')}\n${c.text}`;
      }).join('\n\n');
      
      const vttContent = "WEBVTT\n\n" + vttBody;
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Failed to create VTT url", e);
      return undefined;
    }
  }, [captions]);

  // Cleanup Blob URL
  useEffect(() => {
    return () => {
      if (vttUrl) {
        URL.revokeObjectURL(vttUrl);
      }
    };
  }, [vttUrl]);

  // Audio Analysis & Waveform Generation
  useEffect(() => {
    if (!videoUrl) return;

    const generateWaveform = async () => {
      setIsWaveformReady(false);
      try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        
        const SAMPLES = 100;
        let calculatedPeaks: number[] = [];

        if (blob.size > 50 * 1024 * 1024) {
          for (let i = 0; i < SAMPLES; i++) {
            const val = (Math.sin(i * 0.2) * 0.5 + 0.5) * Math.random() * 0.8 + 0.2;
            calculatedPeaks.push(val);
          }
        } else {
          const arrayBuffer = await blob.arrayBuffer();
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          const channelData = audioBuffer.getChannelData(0);
          const blockSize = Math.floor(channelData.length / SAMPLES);
          
          for (let i = 0; i < SAMPLES; i++) {
            const start = i * blockSize;
            const stride = Math.ceil(blockSize / 100); 
            let sum = 0;
            let count = 0;
            for (let j = 0; j < blockSize; j += stride) {
              sum += Math.abs(channelData[start + j]);
              count++;
            }
            calculatedPeaks.push(sum / count);
          }
          const max = Math.max(...calculatedPeaks, 0.01); 
          calculatedPeaks = calculatedPeaks.map(p => p / max);
        }

        setPeaks(calculatedPeaks);
        setIsWaveformReady(true);
      } catch (e) {
        console.error("Error generating waveform:", e);
      }
    };

    generateWaveform();
  }, [videoUrl]);

  // Draw Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / peaks.length;
    const actualBarWidth = barWidth - 1;

    ctx.clearRect(0, 0, width, height);

    const playedGradient = ctx.createLinearGradient(0, 0, 0, height);
    playedGradient.addColorStop(0, '#818cf8'); 
    playedGradient.addColorStop(1, '#c084fc'); 

    const remainingColor = '#334155'; 

    const progress = duration > 0 ? currentTime / duration : 0;

    peaks.forEach((peak, index) => {
      const x = index * barWidth;
      const barHeight = Math.max(peak * height, 2); 
      const y = (height - barHeight) / 2; 

      const isPlayed = (index / peaks.length) < progress;

      ctx.fillStyle = isPlayed ? playedGradient : remainingColor;
      ctx.beginPath();
      // @ts-ignore
      if (ctx.roundRect) {
         // @ts-ignore
         ctx.roundRect(x, y, actualBarWidth, barHeight, 4);
      } else {
         ctx.rect(x, y, actualBarWidth, barHeight);
      }
      ctx.fill();
    });

  }, [peaks, currentTime, duration, isWaveformReady]);

  const handleTimeUpdate = () => {
    if (videoRef.current && !isExporting) { // Don't update state during export to avoid UI jitter
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!videoRef.current || duration === 0 || isExporting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = Math.max(0, Math.min(1, x / rect.width));
    
    videoRef.current.currentTime = clickProgress * duration;
  };

  const handleDownloadSRT = () => {
    const srtContent = generateSRT(captions);
    downloadTextFile(srtContent, `captions_${targetLangName.toLowerCase()}.srt`);
  };

  // --- Improved Text Wrapping Logic with visualMaxWords constraint ---
  const getWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, captionId: number): string[] => {
    if (textLayoutCache.current[captionId]) {
      return textLayoutCache.current[captionId];
    }

    const words = text.split(' ');
    if (words.length === 0) return [];

    const spaceWidth = ctx.measureText(' ').width;
    const wordWidths = words.map(w => ctx.measureText(w).width);
    
    // Helper to calculate width of range [start, end)
    const getRangeWidth = (start: number, end: number) => {
        if (start >= end) return 0;
        let width = 0;
        for (let i = start; i < end; i++) width += wordWidths[i];
        width += Math.max(0, end - start - 1) * spaceWidth;
        return width;
    };

    // 1. Try Single Line (if within width AND max words)
    const totalWidth = getRangeWidth(0, words.length);
    if (totalWidth <= maxWidth && words.length <= visualMaxWords) {
        const res = [text];
        textLayoutCache.current[captionId] = res;
        return res;
    }

    // 2. Try Balanced Two Lines (Minimize difference in width)
    // Constraint: Neither line can exceed visualMaxWords
    let bestSplit = -1;
    let minDiff = Infinity;

    // Check all possible split points
    for (let i = 1; i < words.length; i++) {
        // Enforce word count limit per line
        if (i > visualMaxWords || (words.length - i) > visualMaxWords) continue;

        const w1 = getRangeWidth(0, i);
        const w2 = getRangeWidth(i, words.length);

        // Only consider splits where BOTH lines fit in width
        if (w1 <= maxWidth && w2 <= maxWidth) {
            const diff = Math.abs(w1 - w2);
            if (diff < minDiff) {
                minDiff = diff;
                bestSplit = i;
            }
        }
    }

    if (bestSplit !== -1) {
        const res = [
            words.slice(0, bestSplit).join(' '),
            words.slice(bestSplit).join(' ')
        ];
        textLayoutCache.current[captionId] = res;
        return res;
    }

    // 3. Fallback: Standard Greedy Wrapping with Max Words Constraint
    const lines: string[] = [];
    let currentLine: string[] = [];
    let currentWidth = 0;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const w = wordWidths[i];
        
        // Conditions to break line:
        // 1. Width overflow
        // 2. Word count overflow
        const widthOverflow = (currentLine.length > 0) && (currentWidth + spaceWidth + w > maxWidth);
        const wordCountOverflow = currentLine.length >= visualMaxWords;

        if (widthOverflow || wordCountOverflow) {
            if (currentLine.length > 0) {
              lines.push(currentLine.join(' '));
              currentLine = [word];
              currentWidth = w;
            } else {
              // Word itself is too long for width, force split?
              // Or if word count is 0 but we hit limit (impossible here since we check >= maxWords)
              currentLine.push(word);
              currentWidth = w;
            }
        } else {
            if (currentLine.length === 0) {
                currentLine.push(word);
                currentWidth = w;
            } else {
                currentLine.push(word);
                currentWidth += spaceWidth + w;
            }
        }
    }
    if (currentLine.length > 0) lines.push(currentLine.join(' '));

    textLayoutCache.current[captionId] = lines;
    return lines;
  };

  // Helper to visually break text for live preview based on word count
  const getVisualPreviewText = (text: string) => {
    if (visualMaxWords >= 50) return text; // Optimize for default case
    const words = text.split(' ');
    const chunks = [];
    for (let i = 0; i < words.length; i += visualMaxWords) {
      chunks.push(words.slice(i, i + visualMaxWords).join(' '));
    }
    return chunks.join('\n');
  };

  // Optimized frame drawing
  const drawFrameToCanvas = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number, time: number) => {
    // Draw the video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Find active caption
    const activeCap = numericCaptions.find(c => time >= c.start && time <= c.end);
    
    if (activeCap) {
      ctx.save();
      
      // Calculate styling based on dimensions
      const calculatedFontSize = Math.floor(height * (fontSize / 100)); // Use state fontSize %
      const maxWidth = width * 0.8;
      const x = width / 2;
      
      // Use selected font and color
      ctx.font = `500 ${calculatedFontSize}px "${selectedFont}", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2, calculatedFontSize * 0.08); // Responsive stroke
      ctx.strokeStyle = 'black';
      ctx.fillStyle = textColor;

      // Animation Logic
      const elapsed = time - activeCap.start;
      
      if (selectedAnimation !== 'none') {
        const bounceDuration = 0.6;
        const fadeDuration = 0.25;
        const slideDuration = 0.3;
        const popDuration = 0.3;
        const shakeDuration = 0.5;

        // Reset context is handled by restore() at end
        
        if (selectedAnimation === 'fade') {
          const progress = Math.max(0, Math.min(1, elapsed / fadeDuration));
          ctx.globalAlpha = progress;
        } else if (selectedAnimation === 'slide') {
          const progress = Math.max(0, Math.min(1, elapsed / slideDuration));
          ctx.globalAlpha = progress;
          // Slide up from 20px below (scaled relative to height)
          const slideOffset = (1 - progress) * (height * 0.05); 
          ctx.translate(0, slideOffset);
        } else if (selectedAnimation === 'pop') {
          const progress = Math.max(0, Math.min(1, elapsed / popDuration));
          ctx.globalAlpha = progress;
          const scale = 0.5 + (0.5 * progress); // Scale 0.5 -> 1.0
          
          const centerY = height * (captionY / 100);
          ctx.translate(x, centerY);
          ctx.scale(scale, scale);
          ctx.translate(-x, -centerY);
        } else if (selectedAnimation === 'bounce') {
          const progress = Math.max(0, Math.min(1, elapsed / bounceDuration));
          // Fade in during first 30%
          if (progress < 0.3) {
            ctx.globalAlpha = progress / 0.3;
          }
          
          // Simple dampened bounce approximation
          let yOffset = 0;
          if (progress < 0.3) {
             yOffset = -20 * (1 - (progress/0.3));
          } else if (progress < 0.5) {
             const p = (progress - 0.3) / 0.2; 
             yOffset = -10 * p; 
          } else if (progress < 0.7) {
             const p = (progress - 0.5) / 0.2;
             yOffset = -10 * (1 - p);
          } else if (progress < 0.9) {
             const p = (progress - 0.7) / 0.2;
             yOffset = -2 * p;
          } else {
             const p = (progress - 0.9) / 0.1;
             yOffset = -2 * (1 - p);
          }
          
          const scaleFactor = height / 1000;
          ctx.translate(0, yOffset * scaleFactor * 50); 

        } else if (selectedAnimation === 'glow') {
           const pulse = (Math.sin(elapsed * 4) + 1) / 2; // 0 to 1
           ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
           ctx.shadowBlur = (5 + (pulse * 15)) * (height/1000); // Scale blur
        } else if (selectedAnimation === 'shake') {
           const progress = Math.max(0, Math.min(1, elapsed / shakeDuration));
           if (progress < 1) {
              const intensity = 5 * (1 - progress);
              const xOff = Math.sin(progress * 50) * intensity * (width/1000);
              ctx.translate(xOff * 5, 0);
           }
        }
      }

      // Get lines (cached)
      const lines = getWrappedLines(ctx, activeCap.text, maxWidth, activeCap.id);
      
      const lineHeight = calculatedFontSize * 1.2;
      const totalTextHeight = lines.length * lineHeight;
      
      // Calculate Y based on captionY percentage
      const centerY = height * (captionY / 100);

      // Draw Background Box
      if (showBackground) {
        let maxLineWidth = 0;
        lines.forEach(line => {
           const metrics = ctx.measureText(line);
           if (metrics.width > maxLineWidth) maxLineWidth = metrics.width;
        });
        
        const paddingX = calculatedFontSize * 0.6;
        const paddingY = calculatedFontSize * 0.3;
        const boxWidth = maxLineWidth + (paddingX * 2);
        const boxHeight = totalTextHeight + (paddingY * 2);
        
        // Center the box
        const boxX = x - (boxWidth / 2);
        const boxY = centerY - (totalTextHeight / 2) - paddingY;
        
        ctx.save();
        ctx.fillStyle = getRgbaColor(backgroundColor, backgroundOpacity);
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) {
            // @ts-ignore
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, calculatedFontSize * 0.4);
        } else {
            ctx.rect(boxX, boxY, boxWidth, boxHeight);
        }
        ctx.fill();
        ctx.restore();
      }

      // Draw Text
      // Calculate starting Y for text (baseline of first line)
      // Box Top = centerY - totalTextHeight/2 - paddingY
      // Text logic used 'bottom' baseline.
      // So baseline of first line should be near Box Top + paddingY + lineHeight
      let lineY = centerY - (totalTextHeight / 2) + lineHeight - (lineHeight * 0.15); // Adjust for visual centering

      lines.forEach((line) => {
        // If background is very opaque/dark, maybe skip thick stroke to avoid messy look
        // Or keep stroke but make it subtle?
        // Let's keep existing logic but optionally reduce stroke width if bg is on.
        
        if (!showBackground || backgroundOpacity < 50) {
           ctx.strokeText(line, x, lineY);
        } else {
           // Lighter stroke for contrast on bg
           ctx.lineWidth = ctx.lineWidth * 0.5;
           ctx.strokeText(line, x, lineY);
        }
        
        ctx.fillText(line, x, lineY);
        lineY += lineHeight;
      });

      ctx.restore();
    }
  };

  const handleFastExport = async () => {
    const video = videoRef.current;
    const canvas = exportCanvasRef.current;
    if (!video || !canvas) return;

    if (!('VideoEncoder' in window)) {
      alert("Your browser does not support fast rendering (WebCodecs). Falling back to realtime recording.");
      handleRealtimeExport();
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Initializing Fast Render...");

    const originalTime = video.currentTime;
    
    try {
      // 1. Setup Muxer
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'V_VP9',
          width: video.videoWidth,
          height: video.videoHeight,
          frameRate: 30
        },
        audio: {
          codec: 'A_OPUS',
          numberOfChannels: 1,
          sampleRate: 48000
        }
      });

      // 2. Setup VideoEncoder
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error", e)
      });

      videoEncoder.configure({
        codec: 'vp09.00.10.08',
        width: video.videoWidth,
        height: video.videoHeight,
        bitrate: 4_000_000 // Increased bitrate for better quality
      });

      // 3. Setup AudioEncoder
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder error", e)
      });
      
      audioEncoder.configure({
        codec: 'opus',
        numberOfChannels: 1,
        sampleRate: 48000,
        bitrate: 128000
      });

      // 4. Decode Audio from source
      setExportStatus("Processing Audio...");
      const response = await fetch(videoUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Encode Audio in chunks to avoid memory issues
      const pcmData = audioBuffer.getChannelData(0); // Mono for simplicity
      const totalFrames = pcmData.length;
      const sampleRate = audioBuffer.sampleRate; // Use source sample rate, assume re-sample by encoder or compatible
      const timestampOffset = 0;
      
      // Process in 1-second chunks
      const CHUNK_DURATION_SEC = 1;
      const CHUNK_SIZE = Math.floor(sampleRate * CHUNK_DURATION_SEC);
      
      for (let i = 0; i < totalFrames; i += CHUNK_SIZE) {
        const len = Math.min(CHUNK_SIZE, totalFrames - i);
        const chunkData = pcmData.slice(i, i + len);
        
        const audioData = new AudioData({
          format: 'f32',
          sampleRate: sampleRate,
          numberOfFrames: len,
          numberOfChannels: 1,
          timestamp: (i / sampleRate) * 1_000_000, // microseconds
          data: chunkData
        });
        
        audioEncoder.encode(audioData);
        audioData.close();
      }
      
      await audioEncoder.flush();

      // 5. Process Video Frames (Seeking Loop)
      setExportStatus("Rendering Video Frames...");
      
      // Clear text layout cache before starting render to ensure new font is used
      textLayoutCache.current = {};

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas ctx failed");

      const fps = 30;
      const interval = 1 / fps;
      let currentTime = 0;
      
      video.pause();
      
      const processFrame = async (t: number) => {
        return new Promise<void>((resolve) => {
          const onSeeked = () => {
             drawFrameToCanvas(ctx, video, canvas.width, canvas.height, t);
             const frame = new VideoFrame(canvas, { timestamp: t * 1_000_000 }); // microseconds
             videoEncoder.encode(frame, { keyFrame: t === 0 || (Math.round(t * fps) % (2 * fps)) === 0 }); // keyframe every ~2s
             frame.close();
             resolve();
          };
          // "seeked" event is robust for ensuring the frame is actually ready
          video.addEventListener('seeked', onSeeked, { once: true });
          video.currentTime = t;
        });
      };

      // Loop
      while (currentTime < duration) {
        await processFrame(currentTime);
        currentTime += interval;
        setExportProgress(Math.min(99, Math.floor((currentTime / duration) * 100)));
      }

      setExportStatus("Finalizing...");
      await videoEncoder.flush();
      
      // 6. Save
      muxer.finalize();
      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `captioned_video_${targetLangName}_fast.webm`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error("Fast export failed", e);
      alert("Fast export encountered an error (likely browser compatibility or memory). Trying realtime fallback.");
      // Reset video
      video.currentTime = originalTime;
      handleRealtimeExport(); // Fallback
    } finally {
       setIsExporting(false);
       video.currentTime = originalTime;
    }
  };

  const handleRealtimeExport = async () => {
    const video = videoRef.current;
    const canvas = exportCanvasRef.current;
    if (!video || !canvas) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Rendering (Real-time)...");

    const originalTime = video.currentTime;
    const originalVolume = video.volume;
    const originalMuted = video.muted;
    
    // Reset text cache
    textLayoutCache.current = {};

    video.currentTime = 0;
    video.muted = false; 
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      setIsExporting(false);
      return;
    }

    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    
    try {
      const canvasStream = canvas.captureStream(30);
      
      let audioTrack;
      // @ts-ignore
      if (video.captureStream) {
        // @ts-ignore
        const videoStream = video.captureStream();
        audioTrack = videoStream.getAudioTracks()[0];
      } else if ((video as any).mozCaptureStream) {
        const videoStream = (video as any).mozCaptureStream();
        audioTrack = videoStream.getAudioTracks()[0];
      }

      if (audioTrack) {
        canvasStream.addTrack(audioTrack);
      }

      mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_with_captions_${targetLangName}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        
        video.currentTime = originalTime;
        video.volume = originalVolume;
        video.muted = originalMuted;
        setIsExporting(false);
      };

      mediaRecorder.start();
      await video.play();

      const drawFrame = () => {
        if (!isExporting && video.paused) return; 

        if (video.ended) {
          mediaRecorder?.stop();
          return;
        }

        drawFrameToCanvas(ctx, video, canvas.width, canvas.height, video.currentTime);
        setExportProgress(Math.floor((video.currentTime / video.duration) * 100));

        requestAnimationFrame(drawFrame);
      };

      drawFrame();

    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export video.");
      video.currentTime = originalTime;
      setIsExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full relative">
      
      {/* Hidden Canvas for Export */}
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* Export Overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="text-2xl font-bold text-white mb-2">{exportStatus}</h3>
          <p className="text-slate-400 mb-6">Please do not close this tab.</p>
          <div className="w-64 bg-slate-800 rounded-full h-2 mb-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
          </div>
          <p className="text-sm text-indigo-300 font-mono">{exportProgress}% Complete</p>
        </div>
      )}

      {/* Left Column: Video Player & Waveform */}
      <div className="flex flex-col gap-4">
        {/* Video Player */}
        <div 
          className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl aspect-video relative group"
          style={{ containerType: 'size' }} // Enable container queries for responsive caption sizing
        >
          <video 
            ref={videoRef}
            src={videoUrl} 
            controls={!isExporting} 
            className="w-full h-full object-contain bg-black"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleDurationChange}
            crossOrigin="anonymous"
          >
            {vttUrl && (
              <track 
                kind="subtitles" 
                srcLang="hi" 
                label={`${targetLangName} AI`} 
                src={vttUrl} 
              />
            )}
          </video>

          {/* Custom Live Caption Overlay (Only visible when not exporting, as export draws directly to canvas) */}
          {activeCaption && !isExporting && (
            <div 
              className="absolute left-0 right-0 flex justify-center px-8 pointer-events-none z-10"
              style={{ 
                top: `${captionY}%`, 
                transform: 'translateY(-50%)' 
              }}
            >
              <span 
                key={activeCaption.id}
                className={`font-medium px-4 py-2 rounded-lg text-center shadow-lg transition-all duration-100 ease-out animate-caption-${selectedAnimation}`}
                style={{ 
                  fontFamily: selectedFont,
                  color: textColor,
                  fontSize: `${fontSize}cqh`, // Responsive font size based on container height percentage
                  lineHeight: '1.2',
                  backgroundColor: showBackground ? getRgbaColor(backgroundColor, backgroundOpacity) : 'transparent',
                  backdropFilter: showBackground ? 'blur(4px)' : 'none',
                  WebkitBackdropFilter: showBackground ? 'blur(4px)' : 'none',
                  textShadow: !showBackground ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none',
                  whiteSpace: 'pre-wrap', // Respect newlines from visual word limit
                }}
              >
                {getVisualPreviewText(activeCaption.text)}
              </span>
            </div>
          )}
        </div>
        
        {/* Waveform Visualizer */}
        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 shadow-md backdrop-blur-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              Audio Waveform
            </h3>
            <span className="text-xs font-mono text-slate-400 bg-slate-900/50 px-2 py-1 rounded">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="relative h-[60px] w-full group cursor-pointer">
            <canvas
              ref={canvasRef}
              width={800} // High resolution width for sharpness
              height={120} // Double height for retina sharpness (scaled down via CSS)
              className="w-full h-full rounded-md"
              onClick={handleWaveformClick}
            />
            {/* Hover overlay hint */}
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-md" />
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Video Summary</h3>
          <p className="text-slate-100 text-sm leading-relaxed">{result.summary}</p>
        </div>
      </div>

      {/* Right Column: Tabs */}
      <div className="flex flex-col h-[600px] lg:h-auto bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('captions')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'captions' 
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-700/50' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
            }`}
          >
            {targetLangName} Captions
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'insights' 
                ? 'text-purple-400 border-b-2 border-purple-500 bg-slate-700/50' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
            }`}
          >
            AI Insights
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {activeTab === 'captions' ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 mb-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Appearance</h3>
                 </div>
                 
                 {/* Controls Row 1: Font & Color */}
                 <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={selectedFont}
                      onChange={(e) => setSelectedFont(e.target.value)}
                      className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded-md transition-colors border-none focus:ring-1 focus:ring-indigo-500 cursor-pointer outline-none min-w-[100px]"
                      title="Font Family"
                      disabled={isExporting}
                    >
                      {FONTS.map(font => (
                        <option key={font.value} value={font.value}>{font.name}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 bg-slate-700 rounded-md px-2 py-1" title="Font Size">
                      <span className="text-xs text-slate-300">Size</span>
                      <input 
                        type="range" 
                        min="2" 
                        max="12" 
                        step="0.5"
                        value={fontSize} 
                        onChange={(e) => setFontSize(parseFloat(e.target.value))}
                        className="w-16 h-1 bg-slate-500 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                        disabled={isExporting}
                      />
                    </div>

                    <div className="relative w-8 h-8 rounded-md overflow-hidden cursor-pointer border border-slate-600 hover:border-indigo-500" title="Text Color">
                       <input 
                         type="color" 
                         value={textColor}
                         onChange={(e) => setTextColor(e.target.value)}
                         className="absolute -top-2 -left-2 w-16 h-16 p-0 border-0 cursor-pointer"
                         disabled={isExporting}
                       />
                    </div>
                 </div>

                 {/* Controls Row 2: Background */}
                 <div className="flex flex-wrap gap-2 items-center bg-slate-800/50 p-1.5 rounded-md border border-slate-700/50 w-full">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none mr-2">
                       <input 
                         type="checkbox" 
                         checked={showBackground}
                         onChange={(e) => setShowBackground(e.target.checked)}
                         className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                         disabled={isExporting}
                       />
                       Background
                    </label>
                    
                    {showBackground && (
                      <>
                        <div className="relative w-6 h-6 rounded overflow-hidden cursor-pointer border border-slate-600 hover:border-indigo-500" title="Background Color">
                           <input 
                             type="color" 
                             value={backgroundColor}
                             onChange={(e) => setBackgroundColor(e.target.value)}
                             className="absolute -top-4 -left-4 w-16 h-16 p-0 border-0 cursor-pointer"
                             disabled={isExporting}
                           />
                        </div>
                        <div className="flex items-center gap-1 flex-1 min-w-[80px]" title="Opacity">
                           <span className="text-[10px] text-slate-400">Op:</span>
                           <input 
                             type="range" 
                             min="0" 
                             max="100" 
                             value={backgroundOpacity} 
                             onChange={(e) => setBackgroundOpacity(parseInt(e.target.value))}
                             className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                             disabled={isExporting}
                           />
                           <span className="text-[10px] text-slate-400 w-5 text-right">{backgroundOpacity}%</span>
                        </div>
                      </>
                    )}
                 </div>

                 {/* Controls Row 3: Animation & Position */}
                 <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={selectedAnimation}
                      onChange={(e) => setSelectedAnimation(e.target.value)}
                      className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded-md transition-colors border-none focus:ring-1 focus:ring-indigo-500 cursor-pointer outline-none min-w-[80px]"
                      title="Animation Effect"
                      disabled={isExporting}
                    >
                      {ANIMATIONS.map(anim => (
                        <option key={anim.value} value={anim.value}>{anim.name}</option>
                      ))}
                    </select>

                    <select
                      value={captionPosition}
                      onChange={(e) => handlePositionChange(e.target.value as any)}
                      className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded-md transition-colors border-none focus:ring-1 focus:ring-indigo-500 cursor-pointer outline-none min-w-[80px]"
                      title="Caption Position"
                      disabled={isExporting}
                    >
                      {POSITIONS.map(pos => (
                        <option key={pos.value} value={pos.value}>{pos.name}</option>
                      ))}
                    </select>
                 </div>
                 
                 {/* Controls Row 4: Custom Position Slider */}
                 {captionPosition === 'custom' && (
                   <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-slate-400 w-8">Pos:</span>
                      <input 
                        type="range" 
                        min="5" 
                        max="95" 
                        value={captionY} 
                        onChange={(e) => setCaptionY(parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        disabled={isExporting}
                      />
                      <span className="text-xs text-slate-400 w-8 text-right">{captionY}%</span>
                   </div>
                 )}

                 {/* Controls Row 5: Visual Word Limit */}
                 <div className="flex items-center gap-2 px-1 bg-slate-800/50 p-1.5 rounded-md border border-slate-700/50 w-full mt-1">
                    <span className="text-xs text-slate-300 w-20">Max Words:</span>
                    <input 
                      type="range" 
                      min="1" 
                      max="15" 
                      value={visualMaxWords === 100 ? 15 : visualMaxWords} 
                      onChange={(e) => {
                         const val = parseInt(e.target.value);
                         setVisualMaxWords(val === 15 ? 100 : val); // Treat max as "unlimited"
                      }}
                      className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      disabled={isExporting}
                    />
                    <span className="text-xs text-slate-400 w-8 text-right">
                       {visualMaxWords >= 50 ? 'All' : visualMaxWords}
                    </span>
                 </div>
              </div>

              <div className="flex justify-between items-center mb-2">
                 <div className="flex items-center gap-2">
                   <h3 className="text-lg font-semibold text-white">Transcript</h3>
                   <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">Editable</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleFastExport}
                    disabled={isExporting}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Render video with burned-in captions (Accelerated)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Export Video
                  </button>
                  <button 
                    onClick={handleDownloadSRT}
                    disabled={isExporting}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    SRT
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {numericCaptions.length === 0 ? (
                  <p className="text-slate-500 italic">No captions parsed. Raw output might be invalid.</p>
                ) : (
                  numericCaptions.map((cap) => (
                    <div 
                      key={cap.id} 
                      className={`p-3 rounded-lg border transition-all duration-300 ${
                        currentTime >= cap.start && currentTime <= cap.end
                          ? 'bg-indigo-500/20 border-indigo-500/50 shadow-lg' 
                          : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => {
                        // Only seek if we are NOT clicking inside the textarea
                        if (videoRef.current && !isExporting) videoRef.current.currentTime = cap.start;
                      }}
                    >
                      <div className="flex justify-between text-xs text-slate-500 mb-1 font-mono">
                        <span className={currentTime >= cap.start && currentTime <= cap.end ? 'text-indigo-300' : ''}>
                          {cap.startTime}
                        </span>
                        <span>{cap.endTime}</span>
                      </div>
                      <textarea
                        className={`w-full bg-transparent resize-none focus:outline-none focus:ring-0 border-none p-0 text-lg leading-relaxed ${
                            currentTime >= cap.start && currentTime <= cap.end
                              ? 'text-white font-medium placeholder-indigo-300/50' 
                              : 'text-slate-300 placeholder-slate-600'
                          }`}
                        value={cap.text}
                        onChange={(e) => handleCaptionChange(cap.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()} // Prevent seeking when clicking text to edit
                        rows={Math.max(1, Math.ceil(cap.text.length / 50))} // Auto-size roughly
                        disabled={isExporting}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
               <h3 className="text-lg font-semibold text-white mb-6">Topic Analysis</h3>
               <div className="flex-1 min-h-[300px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={result.topics} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                     <XAxis type="number" domain={[0, 100]} hide />
                     <YAxis dataKey="topic" type="category" width={100} tick={{fill: '#94a3b8', fontSize: 12}} />
                     <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                        itemStyle={{ color: '#818cf8' }}
                        cursor={{fill: '#334155', opacity: 0.4}}
                     />
                     <Bar dataKey="relevance" radius={[0, 4, 4, 0]}>
                       {result.topics.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#818cf8' : '#c084fc'} />
                       ))}
                     </Bar>
                   </BarChart>
                 </ResponsiveContainer>
               </div>
               <div className="mt-6 p-4 bg-slate-700/30 rounded-lg">
                 <p className="text-sm text-slate-400">
                   * Relevance scores are generated by Gemini based on audio-visual context.
                 </p>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsView;