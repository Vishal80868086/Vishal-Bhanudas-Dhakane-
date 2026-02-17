import React, { useState, useRef, useCallback } from 'react';
import { editImage } from '../services/geminiService';
import { ACCEPTED_IMAGE_TYPES } from '../constants';

const ImageEditor: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Please upload a valid image file.");
      return;
    }
    setError(null);
    setImageFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => setOriginalImage(e.target?.result as string);
    reader.readAsDataURL(file);
    
    // Reset previous results
    setResultImage(null);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleGenerate = async () => {
    if (!imageFile || !prompt.trim()) return;

    setIsProcessing(true);
    setError(null);
    setResultImage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await editImage(imageFile, prompt, controller.signal);
      setResultImage(result);
    } catch (e: any) {
      if (e.message !== "Operation cancelled by user") {
        console.error(e);
        setError(e.message || "Failed to edit image.");
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleDownload = () => {
    if (resultImage) {
      const link = document.createElement('a');
      link.href = resultImage;
      link.download = `edited_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
       <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">AI Image Magic</h1>
          <p className="text-slate-400">
            Modify images with natural language using Gemini 2.5 Flash. <br/>
            Try "Add fireworks", "Make it sketch style", or "Remove the background".
          </p>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Panel: Input */}
          <div className="space-y-6">
             {/* Upload Area */}
             <div 
               onDragOver={handleDragOver}
               onDragLeave={handleDragLeave}
               onDrop={handleDrop}
               className={`
                 relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 h-[300px] flex flex-col items-center justify-center
                 ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}
                 ${!originalImage ? 'cursor-pointer' : ''}
               `}
               onClick={() => !originalImage && document.getElementById('image-upload')?.click()}
             >
                {originalImage ? (
                  <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg group">
                    <img src={originalImage} alt="Original" className="max-w-full max-h-full object-contain" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setOriginalImage(null); setImageFile(null); setResultImage(null); }}
                      className="absolute top-2 right-2 bg-slate-900/80 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                      title="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input 
                      id="image-upload"
                      type="file" 
                      accept={ACCEPTED_IMAGE_TYPES}
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center mb-4">
                       <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                       </svg>
                    </div>
                    <p className="text-slate-300 font-medium">Click or drag image to upload</p>
                    <p className="text-slate-500 text-sm mt-1">JPEG, PNG, WebP</p>
                  </>
                )}
             </div>

             {/* Prompt Input */}
             <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2 block">Instruction</label>
                <div className="relative">
                   <textarea
                     value={prompt}
                     onChange={(e) => setPrompt(e.target.value)}
                     placeholder="E.g., Turn this into a cyberpunk city, add a cat in the corner..."
                     className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors h-24 resize-none"
                     disabled={isProcessing}
                   />
                </div>
                
                {error && (
                  <p className="text-red-400 text-sm mt-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {error}
                  </p>
                )}

                <div className="mt-4 flex justify-end">
                   {isProcessing ? (
                     <button 
                       onClick={handleCancel}
                       className="px-6 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors text-sm font-medium"
                     >
                       Cancel
                     </button>
                   ) : (
                     <button
                       onClick={handleGenerate}
                       disabled={!originalImage || !prompt.trim()}
                       className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-lg shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                     >
                        <span>Generate Magic</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                     </button>
                   )}
                </div>
             </div>
          </div>

          {/* Right Panel: Result */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
             
             {/* Background Grid Pattern */}
             <div className="absolute inset-0 opacity-20" 
                  style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
             </div>

             {isProcessing ? (
                <div className="text-center z-10 space-y-4">
                   <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                   <p className="text-indigo-300 font-medium animate-pulse">Generating your masterpiece...</p>
                </div>
             ) : resultImage ? (
                <div className="relative z-10 w-full h-full flex flex-col items-center">
                   <div className="relative rounded-lg overflow-hidden shadow-2xl border border-slate-700/50 mb-6 max-h-[500px]">
                      <img src={resultImage} alt="Edited Result" className="max-w-full max-h-full object-contain" />
                   </div>
                   <button 
                     onClick={handleDownload}
                     className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
                   >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                     </svg>
                     Download Image
                   </button>
                </div>
             ) : (
                <div className="text-center z-10 text-slate-500">
                   <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                      <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                   </div>
                   <p>Your edited image will appear here</p>
                </div>
             )}
          </div>
       </div>
    </div>
  );
};

export default ImageEditor;