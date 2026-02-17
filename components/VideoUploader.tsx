import React, { useCallback, useState } from 'react';
import { MAX_FILE_SIZE_MB, ACCEPTED_VIDEO_TYPES, CAPTION_LANGUAGES, SOURCE_LANGUAGES } from '../constants';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
  maxWords: number;
  setMaxWords: (val: number) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ 
  onFileSelect, 
  isLoading, 
  sourceLang, 
  setSourceLang, 
  targetLang, 
  setTargetLang,
  maxWords,
  setMaxWords
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displaySize = MAX_FILE_SIZE_MB >= 1024 
    ? `${(MAX_FILE_SIZE_MB / 1024).toFixed(0)} GB` 
    : `${MAX_FILE_SIZE_MB} MB`;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateAndSelect = (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max size is ${displaySize} for this demo.`);
      return;
    }
    if (!file.type.startsWith('video/')) {
      setError("Please upload a valid video file.");
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      
      {/* Settings Panel */}
      <div className="bg-slate-800/60 rounded-xl p-5 mb-6 border border-slate-700 backdrop-blur-sm">
        <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {/* Source Language */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-medium mb-1.5 ml-1">Original Audio Language</label>
            <div className="relative">
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                disabled={isLoading}
                className="w-full appearance-none bg-slate-900 border border-slate-700 hover:border-indigo-500 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
              >
                {SOURCE_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          {/* Target Language */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-medium mb-1.5 ml-1">Caption Language</label>
            <div className="relative">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                disabled={isLoading}
                className="w-full appearance-none bg-slate-900 border border-slate-700 hover:border-purple-500 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors"
              >
                {CAPTION_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          {/* Words per Line Slider */}
          <div className="flex flex-col md:col-span-2">
            <div className="flex justify-between items-center mb-1.5 ml-1">
               <label className="text-xs text-slate-400 font-medium">
                 Max Words per Line
               </label>
               <span className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                 {maxWords} words
               </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Rapid</span>
              <input 
                type="range" 
                min="1" 
                max="15" 
                step="1"
                value={maxWords}
                onChange={(e) => setMaxWords(parseInt(e.target.value))}
                disabled={isLoading}
                className="flex-grow h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
              />
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Standard</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 ml-1">
              Lower values (1-4) are best for fast-paced, TikTok-style videos. Higher values (10+) are for traditional subtitles.
            </p>
          </div>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'}
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          type="file"
          accept={ACCEPTED_VIDEO_TYPES}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-100">Upload Video</h3>
            <p className="text-sm text-slate-400 mt-2">
              Drag & drop or click to browse
            </p>
            <p className="text-xs text-slate-500 mt-4">
              MP4, WebM up to {displaySize}
            </p>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default VideoUploader;