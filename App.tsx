import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import ResultsView from './components/ResultsView';
import ImageEditor from './components/ImageEditor';
import Logo from './components/Logo';
import { AppState, VideoFile, AnalysisResult } from './types';
import { generateVideoCaptions } from './services/geminiService';
import { CAPTION_LANGUAGES } from './constants';

type AppMode = 'video' | 'image';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('video');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
  
  // Language State
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('hi');
  const [maxWords, setMaxWords] = useState<number>(6); // Default to short, punchy captions
  
  // Reference to the AbortController to cancel ongoing requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (currentVideo?.previewUrl) {
        URL.revokeObjectURL(currentVideo.previewUrl);
      }
    };
  }, [currentVideo]);

  const handleFileSelect = async (file: File) => {
    try {
      setAppState(AppState.UPLOADING);
      setStatusMessage("Preparing video...");
      
      const previewUrl = URL.createObjectURL(file);
      
      setCurrentVideo({
        file,
        previewUrl,
        base64: undefined, // Base64 is not generated eagerly anymore
        mimeType: file.type
      });

      setAppState(AppState.PROCESSING);
      await processVideo(file);

    } catch (e: any) {
      console.error(e);
      setErrorMsg("Failed to load video file. Please try again.");
      setAppState(AppState.ERROR);
    }
  };

  const processVideo = async (file: File) => {
    try {
      setStatusMessage("Initializing analysis...");
      setUploadProgress(undefined);
      
      // Initialize AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Pass the setStatusMessage callback to receive granular updates and progress
      // Pass controller.signal to enable cancellation
      // Pass language selections and max words constraint
      const result = await generateVideoCaptions(
        file, 
        sourceLang,
        targetLang,
        maxWords,
        (status, progress) => {
          setStatusMessage(status);
          setUploadProgress(progress);
        },
        controller.signal
      );
      
      // Clear controller on success
      abortControllerRef.current = null;
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);
    } catch (e: any) {
      // If manually cancelled, just reset without error state
      if (e.message === "Operation cancelled by user") {
        console.log("Process cancelled");
        return;
      }

      console.error(e);
      setErrorMsg(e.message || "Failed to generate captions. The video might be too long or the content unclear.");
      setAppState(AppState.ERROR);
    } finally {
        abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        resetApp();
    }
  };

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setCurrentVideo(null);
    setAnalysisResult(null);
    setErrorMsg('');
    setStatusMessage('');
    setUploadProgress(undefined);
  };

  const getTargetLangName = () => {
    const lang = CAPTION_LANGUAGES.find(l => l.code === targetLang);
    if (lang?.code === 'hi_auto') return 'Auto (Hindi Priority)';
    return lang?.name || 'Hindi';
  };

  // Switch logic to reset states when changing modes
  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Optional: Reset states if switching modes
    // resetApp(); 
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header currentMode={mode} setMode={handleModeChange} />

      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro Hero (Video Mode Only) */}
        {mode === 'video' && appState === AppState.IDLE && (
          <div className="text-center mb-12 flex flex-col items-center">
            <Logo className="w-20 h-20 mb-6 shadow-2xl shadow-indigo-500/20" />
            <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mb-6 tracking-tight">
              AI Video Captions
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
              Upload your video and let Gemini 3 Flash analyze the audio to generate accurate, synchronized subtitles automatically.
            </p>
          </div>
        )}

        {/* IMAGE MODE */}
        {mode === 'image' && (
           <div className="animate-fade-in">
             <ImageEditor />
           </div>
        )}

        {/* VIDEO MODE */}
        {mode === 'video' && (
          <>
            {/* State: IDLE / Uploading */}
            {(appState === AppState.IDLE || appState === AppState.UPLOADING) && (
              <div className="transition-all duration-500 ease-in-out transform animate-fade-in">
                <VideoUploader 
                  onFileSelect={handleFileSelect} 
                  isLoading={appState === AppState.UPLOADING}
                  sourceLang={sourceLang}
                  setSourceLang={setSourceLang}
                  targetLang={targetLang}
                  setTargetLang={setTargetLang}
                  maxWords={maxWords}
                  setMaxWords={setMaxWords}
                />
                {appState === AppState.UPLOADING && (
                  <div className="mt-8 text-center animate-pulse">
                    <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-indigo-400 font-medium">Preparing...</p>
                  </div>
                )}
              </div>
            )}

            {/* State: PROCESSING */}
            {appState === AppState.PROCESSING && (
              <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-8 animate-fade-in">
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl animate-pulse">✨</span>
                  </div>
                </div>
                
                <div className="max-w-md w-full px-4">
                  <h3 className="text-2xl font-bold text-white mb-4">Processing Video</h3>
                  
                  {/* Status Display */}
                  <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 backdrop-blur-sm shadow-lg mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <p className="text-indigo-300 font-medium text-lg transition-all duration-300 ease-in-out">
                            {statusMessage}
                        </p>
                        {uploadProgress !== undefined && (
                            <span className="text-sm font-mono text-indigo-400">{uploadProgress}%</span>
                        )}
                    </div>
                    
                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden relative">
                        {uploadProgress !== undefined ? (
                            <div 
                              className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                        ) : (
                            <div className="absolute top-0 left-0 h-full bg-indigo-500 animate-progress-indeterminate rounded-full w-full origin-left"></div>
                        )}
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <button 
                    onClick={handleCancel}
                    className="px-5 py-2 text-sm text-red-400 hover:text-white border border-red-500/30 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    Cancel Operation
                  </button>

                  <p className="text-xs text-slate-500 mt-6">
                    Large files (up to 5GB) may take a few minutes to upload and process.
                    <br/>Please do not close this tab.
                  </p>
                </div>
              </div>
            )}

            {/* State: SUCCESS */}
            {appState === AppState.SUCCESS && currentVideo && analysisResult && (
              <div className="animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white">Results</h2>
                  <button 
                    onClick={resetApp}
                    className="text-sm text-slate-400 hover:text-white underline underline-offset-4"
                  >
                    Process Another Video
                  </button>
                </div>
                <ResultsView 
                  result={analysisResult} 
                  videoUrl={currentVideo.previewUrl} 
                  targetLangName={getTargetLangName()}
                />
              </div>
            )}

            {/* State: ERROR */}
            {appState === AppState.ERROR && (
              <div className="flex flex-col items-center justify-center h-[40vh] text-center space-y-6">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-2">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
                  <p className="text-red-400 max-w-md mx-auto">{errorMsg}</p>
                </div>
                <button 
                  onClick={resetApp}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
                >
                  Try Again
                </button>
              </div>
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-slate-500 text-sm">
          <p>Powered by Google Gemini API</p>
        </div>
      </footer>
    </div>
  );
};

export default App;