import React, { useState, useRef, useCallback } from 'react';
import { 
  Camera, 
  Upload, 
  Copy, 
  Check, 
  Image as ImageIcon, 
  Loader2, 
  X,
  RefreshCw,
  ScanText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractTextFromImage, OCRResult } from './lib/gemini';

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [results, setResults] = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    } else {
      setError("Please drop a valid image file.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    // Basic validation
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setError("Image size is too large. Please upload an image smaller than 10MB.");
      return;
    }

    // Reset state for new upload
    setImage(null);
    setResults(null);
    setError(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setImage(base64);
      
      try {
        const ocrResult = await extractTextFromImage(base64, file.type);
        setResults(ocrResult);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to extract text. Please try again with a clearer image.");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCopy = () => {
    if (results?.rawText) {
      navigator.clipboard.writeText(results.rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (results?.rawText) {
      try {
        const blob = new Blob([results.rawText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extracted-text-${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError("Failed to download the file.");
      }
    }
  };

  const reset = () => {
    setImage(null);
    setResults(null);
    setError(null);
    setLoading(false);
  };

  return (
    <div 
      className={`min-h-screen bg-[#F5F5F4] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#F5F5F4] transition-colors duration-300 ${isDragging ? 'bg-[#E4E3E0]' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="border-b border-[#141414]/10 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center">
              <ScanText className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight italic serif">Smart Vision</h1>
          </div>
          {image && (
            <button 
              onClick={reset}
              className="text-sm font-medium opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!image && !loading ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                  Smart Intelligence for <br />
                  <span className="italic serif text-[#141414]/40">Your Vision.</span>
                </h2>
                <p className="text-[#141414]/60 max-w-md mx-auto">
                  Instantly extract text, summarize context, and translate into Urdu with AI-powered precision.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative h-64 bg-white border-2 border-dashed border-[#141414]/10 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-[#141414] hover:bg-[#141414] hover:text-white transition-all duration-300"
                >
                  <div className="w-16 h-16 rounded-full bg-[#F5F5F4] group-hover:bg-white/10 flex items-center justify-center transition-colors">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">Browse Files</p>
                    <p className="text-sm opacity-60">Drag and drop or click</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </button>

                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="group relative h-64 bg-white border-2 border-dashed border-[#141414]/10 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-[#141414] hover:bg-[#141414] hover:text-white transition-all duration-300"
                >
                  <div className="w-16 h-16 rounded-full bg-[#F5F5F4] group-hover:bg-white/10 flex items-center justify-center transition-colors">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">Use Camera</p>
                    <p className="text-sm opacity-60">Capture a new photo</p>
                  </div>
                  <input 
                    type="file" 
                    ref={cameraInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                  />
                </button>
              </div>

              {/* How it works */}
              <div className="pt-12 border-t border-[#141414]/5">
                <h3 className="text-center text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-8">How it works</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">01</span>
                    </div>
                    <h4 className="font-bold">Upload</h4>
                    <p className="text-sm text-[#141414]/60">Select an image or take a photo of any text.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">02</span>
                    </div>
                    <h4 className="font-bold">Analyze</h4>
                    <p className="text-sm text-[#141414]/60">AI scans and interprets the content instantly.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">03</span>
                    </div>
                    <h4 className="font-bold">Get Results</h4>
                    <p className="text-sm text-[#141414]/60">Receive raw text, summaries, and Urdu translations.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-6 py-4 rounded-2xl flex items-center justify-between">
                  <p className="text-sm font-medium">{error}</p>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Image Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Source Image</h3>
                    <button 
                      onClick={reset}
                      className="p-1 hover:bg-[#141414]/5 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative aspect-[4/3] bg-white rounded-3xl overflow-hidden border border-[#141414]/5 shadow-sm">
                    {image ? (
                      <img 
                        src={image} 
                        alt="Preview" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin opacity-20" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Meaningful Interpretation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Smart Insights</h3>
                  </div>
                  
                  <div className="bg-white rounded-3xl p-8 h-full border border-[#141414]/5 shadow-sm relative overflow-hidden flex flex-col gap-6">
                    {loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 backdrop-blur-sm z-10">
                        <Loader2 className="w-10 h-10 animate-spin text-[#141414]" />
                        <p className="text-sm font-medium animate-pulse">Analyzing context...</p>
                      </div>
                    ) : error ? (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
                        <p className="text-red-500 font-medium">{error}</p>
                        <button 
                          onClick={() => image && processFile(new File([], 'retry'))} 
                          className="text-sm underline underline-offset-4 font-bold"
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="max-w-none text-[#141414] text-lg italic serif leading-relaxed">
                          {results?.meaningfulText}
                        </div>
                        {results?.urduSummary && (
                          <div className="pt-6 border-t border-[#141414]/5">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30 mb-2">Urdu Summary (اردو خلاصہ)</h4>
                            <div className="max-w-none text-[#141414] text-xl leading-relaxed text-right dir-rtl font-serif">
                              {results.urduSummary}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Raw Extraction Results */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Extracted Information</h3>
                  {results && (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest hover:text-[#141414] transition-colors"
                        title="Download as .txt"
                      >
                        <RefreshCw className="w-3.5 h-3.5 rotate-180" />
                        <span>Download</span>
                      </button>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest hover:text-[#141414] transition-colors"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="bg-white rounded-3xl p-8 min-h-[300px] border border-[#141414]/5 shadow-sm relative">
                  {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 backdrop-blur-sm z-10">
                      <Loader2 className="w-10 h-10 animate-spin text-[#141414]" />
                      <p className="text-sm font-medium animate-pulse">Extracting text...</p>
                    </div>
                  ) : error ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
                      <p className="text-red-500 font-medium">{error}</p>
                    </div>
                  ) : (
                    <div className="max-w-none text-[#141414]/80 text-lg font-mono overflow-auto max-h-[600px] custom-scrollbar">
                      {results?.rawText?.split('\n\n').map((para, i) => (
                        <p key={i} className="mb-6 leading-relaxed whitespace-pre-wrap last:mb-0">
                          {para}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-12 border-t border-[#141414]/5">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">
            Smart Vision &copy; {new Date().getFullYear()}
          </p>
          <p className="text-sm font-medium text-[#141414]/60">
            Developed by Mohammad Shahid
          </p>
          <p className="text-[10px] text-[#141414]/30 max-w-xs mx-auto">
            All rights reserved. Advanced OCR and multi-lingual interpretation.
          </p>
        </div>
      </footer>
    </div>
  );
}
