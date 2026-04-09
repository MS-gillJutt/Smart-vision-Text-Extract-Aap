import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Copy, 
  Check, 
  Image as ImageIcon, 
  Loader2, 
  X,
  RefreshCw,
  ScanText,
  Mic,
  MicOff,
  FileText,
  Presentation,
  Download,
  History,
  Plus,
  Trash2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import { processFileWithAI, askQuestionAboutContent, OCRResult } from './lib/gemini';

// Session Types
interface Session {
  id: string;
  timestamp: number;
  image: string | null;
  results: OCRResult | null;
  qaHistory: { question: string; answer: string }[];
  fileContent: string | { text: string } | null;
  fileMimeType: string;
  fileName: string;
}

// Speech Recognition Types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [results, setResults] = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [qaHistory, setQaHistory] = useState<{ question: string; answer: string }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [fileContent, setFileContent] = useState<string | { text: string } | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [history, setHistory] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [homeLangIndex, setHomeLangIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('smart_vision_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory) as Session[];
        // Filter out items older than 30 minutes
        const now = Date.now();
        const validHistory = parsed.filter(item => now - item.timestamp < 30 * 60 * 1000);
        setHistory(validHistory);
        localStorage.setItem('smart_vision_history', JSON.stringify(validHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('smart_vision_history', JSON.stringify(history));
  }, [history]);

  // Cleanup old history items every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => {
        const filtered = prev.filter(item => now - item.timestamp < 30 * 60 * 1000);
        if (filtered.length !== prev.length) return filtered;
        return prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const homeLanguages = [
    {
      lang: 'en',
      text: "Smart Vision uses advanced AI to extract text, summarize documents, and provide meaningful insights in multiple languages.",
      dir: 'ltr'
    },
    {
      lang: 'ur',
      text: "اسمارٹ ویژن جدید مصنوعی ذہانت کا استعمال کرتے ہوئے متن نکالتا ہے، دستاویزات کا خلاصہ کرتا ہے اور متعدد زبانوں میں بامعنی معلومات فراہم کرتا ہے۔",
      dir: 'rtl'
    },
    {
      lang: 'hi',
      text: "स्मार्ट विजन उन्नत एआई का उपयोग करके टेक्स्ट निकालता है, दस्तावेजों का सारांश देता है और कई भाषाओं में सार्थक जानकारी प्रदान करता है।",
      dir: 'ltr'
    },
    {
      lang: 'es',
      text: "Smart Vision utiliza IA avanzada para extraer texto, resumir documentos y proporcionar información significativa en varios idiomas.",
      dir: 'ltr'
    },
    {
      lang: 'fr',
      text: "Smart Vision utilise l'IA avancée pour extraire du texte, résumer des documents et fournir des informations pertinentes dans plusieurs langues.",
      dir: 'ltr'
    },
    {
      lang: 'ar',
      text: "يستخدم سمارت فيجن الذكاء الاصطناعي المتقدم لاستخراج النصوص وتلخيص المستندات وتقديم رؤى مفيدة بلغات متعددة.",
      dir: 'rtl'
    }
  ];

  // Cycle home screen languages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setHomeLangIndex(prev => (prev + 1) % homeLanguages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setCurrentQuestion(transcript);
        
        // If it's a final result, we can still check for commands
        if (event.results[event.results.length - 1].isFinal) {
          const lastTranscript = event.results[event.results.length - 1][0].transcript.toLowerCase();
          if (lastTranscript.includes("reset") || lastTranscript.includes("clear")) {
            reset();
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        setVoiceFeedback("Error listening. Try again.");
        setTimeout(() => setVoiceFeedback(null), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.ref = recognition;
      recognitionRef.current = recognition;
    }
  }, []);

  const handleVoiceCommand = (command: string) => {
    setVoiceFeedback(`Command: "${command}"`);
    setTimeout(() => setVoiceFeedback(null), 3000);

    if (command.includes("camera") || command.includes("take photo")) {
      cameraInputRef.current?.click();
    } else if (command.includes("upload") || command.includes("browse") || command.includes("file")) {
      fileInputRef.current?.click();
    } else if (command.includes("reset") || command.includes("clear") || command.includes("start over")) {
      reset();
    } else if (command.includes("copy")) {
      handleCopy();
    } else if (command.includes("download")) {
      handleDownload();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          setVoiceFeedback("Listening for commands...");
        } catch (e) {
          console.error("Recognition already started", e);
          // Force reset state if it got out of sync
          setIsListening(true);
        }
      } else {
        setError("Speech recognition is not supported in this browser.");
      }
    }
  };

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
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      // Clear the input so the same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  const extractTextFromPptx = async (file: File): Promise<string> => {
    try {
      console.log("Starting PPTX extraction for:", file.name);
      const zip = await JSZip.loadAsync(file);
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });

      console.log(`Found ${slideFiles.length} slides.`);
      let fullText = '';
      
      for (const slideFile of slideFiles) {
        const content = await zip.file(slideFile)?.async('text');
        if (content) {
          // More robust regex to extract text from XML tags <a:t>
          const matches = content.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
          if (matches) {
            const slideText = matches
              .map(m => m.replace(/<a:t[^>]*>|<\/a:t>/g, ''))
              .filter(t => t.trim().length > 0)
              .join(' ');
            
            const slideNum = slideFile.match(/\d+/)?.[0] || '';
            fullText += `[Slide ${slideNum}]\n${slideText}\n\n`;
          }
        }
      }
      
      if (!fullText) {
        console.warn("No text extracted from PPTX slides.");
      }
      
      return fullText || "No readable text found in PowerPoint slides.";
    } catch (err) {
      console.error("PPTX extraction error:", err);
      throw new Error("Failed to extract text from PowerPoint file. The file might be corrupted or protected.");
    }
  };

  const processFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isPptx = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    if (!isImage && !isPdf && !isDocx && !isPptx) {
      setError("Unsupported file type. Please upload an image, PDF, Word, or PowerPoint file.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      setError("File size is too large. Please upload a file smaller than 20MB.");
      return;
    }

    setImage(null);
    setResults(null);
    setError(null);
    setLoading(true);
    setFileName(file.name);

    try {
      let aiResult: OCRResult;
      setFileMimeType(file.type);

      if (isImage || isPdf) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        const base64 = await base64Promise;
        if (isImage) setImage(base64);
        setFileContent(base64);
        aiResult = await processFileWithAI(base64, file.type);
      } else if (isDocx) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value;
        if (!text.trim()) {
          throw new Error("The Word document appears to be empty or contains no readable text.");
        }
        setFileContent({ text });
        aiResult = await processFileWithAI({ text }, file.type);
      } else if (isPptx) {
        const text = await extractTextFromPptx(file);
        if (!text.trim() || text === "No readable text found in PowerPoint slides.") {
          throw new Error("The PowerPoint file appears to be empty or contains no readable text.");
        }
        setFileContent({ text });
        aiResult = await processFileWithAI({ text }, file.type);
      } else {
        throw new Error("Unsupported file format.");
      }

      setResults(aiResult);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process file. Please try again.");
    } finally {
      setLoading(false);
    }
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

  const handleDownloadImage = () => {
    if (image) {
      const link = document.createElement('a');
      link.href = image;
      link.download = `smart-vision-source-${new Date().getTime()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleAskQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentQuestion.trim() || !fileContent) return;

    setIsAsking(true);
    setError(null);

    try {
      const answer = await askQuestionAboutContent(fileContent, currentQuestion, fileMimeType);
      setQaHistory(prev => [{ question: currentQuestion, answer }, ...prev]);
      setCurrentQuestion('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to get an answer. Please try again.");
    } finally {
      setIsAsking(false);
    }
  };

  const handleDownloadAnswer = (qa: { question: string; answer: string }) => {
    try {
      const content = `Question: ${qa.question}\n\nAnswer:\n${qa.answer}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `answer-${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download the answer.");
    }
  };

  const handleDownloadSummary = (text: string, title: string) => {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to download the ${title}.`);
    }
  };

  const saveCurrentToHistory = () => {
    if (!results && !image) return;
    
    const newSession: Session = {
      id: currentSessionId || `session-${Date.now()}`,
      timestamp: Date.now(),
      image,
      results,
      qaHistory,
      fileContent,
      fileMimeType,
      fileName: fileName || 'Untitled Document'
    };

    setHistory(prev => {
      const filtered = prev.filter(s => s.id !== newSession.id);
      return [newSession, ...filtered];
    });
    return newSession.id;
  };

  const loadSession = (session: Session) => {
    saveCurrentToHistory();
    setCurrentSessionId(session.id);
    setImage(session.image);
    setResults(session.results);
    setQaHistory(session.qaHistory);
    setFileContent(session.fileContent);
    setFileMimeType(session.fileMimeType);
    setFileName(session.fileName);
    setError(null);
  };

  const startNewSession = () => {
    saveCurrentToHistory();
    reset();
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      reset();
    }
  };

  const reset = () => {
    setImage(null);
    setResults(null);
    setError(null);
    setLoading(false);
    setQaHistory([]);
    setFileContent(null);
    setCurrentSessionId(null);
    setFileName('');
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
            <div className="flex flex-col">
              <h1 className="font-bold text-xl tracking-tight italic serif">Smart Vision</h1>
              <p className="text-[10px] font-medium text-[#141414]/40 leading-none mt-0.5">
                AI-Powered Document Intelligence & Translation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(image || results) && (
              <button 
                onClick={startNewSession}
                className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-xl hover:bg-[#262626] transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Entry
              </button>
            )}
            {(image || results) && (
              <button 
                onClick={reset}
                className="text-sm font-medium opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* History Section */}
        {history.length > 0 && (
          <div className="mb-12 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#141414]/40" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Recent Entries (Saved for 30m)</h3>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#141414]/30">
                <Clock className="w-3 h-3" />
                <span>Auto-cleans items older than 30 minutes</span>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
              {history.map((session) => (
                <button
                  key={session.id}
                  onClick={() => loadSession(session)}
                  className={`flex-shrink-0 w-48 p-4 rounded-2xl border transition-all text-left group relative ${
                    currentSessionId === session.id
                      ? 'bg-white border-[#141414] shadow-md'
                      : 'bg-white/50 border-[#141414]/5 hover:border-[#141414]/20'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-xs font-bold truncate pr-6">{session.fileName}</p>
                    <p className="text-[10px] text-[#141414]/40">
                      {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteSession(e, session.id)}
                    className="absolute top-3 right-3 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 rounded-md transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!image && !results && !loading && !error ? (
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
                <div className="h-20 md:h-16 relative">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={homeLangIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`text-[#141414]/60 max-w-md mx-auto absolute inset-0 ${
                        homeLanguages[homeLangIndex].dir === 'rtl' ? 'dir-rtl serif font-bold' : ''
                      }`}
                    >
                      {homeLanguages[homeLangIndex].text}
                    </motion.p>
                  </AnimatePresence>
                </div>
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
                    <p className="font-bold text-lg">Upload Documents</p>
                    <p className="text-sm opacity-60">Images, PDF, Word, PPTX</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*,.pdf,.docx,.pptx" 
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 text-center">
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">01</span>
                    </div>
                    <h4 className="font-bold text-sm">Upload</h4>
                    <p className="text-[11px] text-[#141414]/60 leading-tight">Select an image, PDF, Word, or PowerPoint file.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">02</span>
                    </div>
                    <h4 className="font-bold text-sm">Analyze</h4>
                    <p className="text-[11px] text-[#141414]/60 leading-tight">AI scans and interprets the content instantly.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">03</span>
                    </div>
                    <h4 className="font-bold text-sm">Get Results</h4>
                    <p className="text-[11px] text-[#141414]/60 leading-tight">Receive raw text, summaries, and Urdu translations.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">04</span>
                    </div>
                    <h4 className="font-bold text-sm">Ask Q&A</h4>
                    <p className="text-[11px] text-[#141414]/60 leading-tight">Ask specific questions about any part of the document.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#141414]/5">
                      <span className="font-bold text-xs">05</span>
                    </div>
                    <h4 className="font-bold text-sm">30m Save</h4>
                    <p className="text-[11px] text-[#141414]/60 leading-tight">Your work is saved for 30 minutes for easy access.</p>
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
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Source Image</h3>
                      <div className="flex bg-[#141414]/5 p-0.5 rounded-lg">
                        {(['sm', 'md', 'lg'] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => setImageSize(size)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                              imageSize === size 
                                ? 'bg-white text-[#141414] shadow-sm' 
                                : 'text-[#141414]/40 hover:text-[#141414]'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {imageSize === 'lg' && image && (
                        <button 
                          onClick={handleDownloadImage}
                          className="p-1.5 bg-[#141414] text-white rounded-full hover:bg-[#262626] transition-colors shadow-lg"
                          title="Download Image"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button 
                        onClick={reset}
                        className="p-1 hover:bg-[#141414]/5 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <motion.div 
                    layout
                    className={`relative bg-white rounded-3xl overflow-hidden border border-[#141414]/5 shadow-sm transition-all duration-500 ease-in-out ${
                      imageSize === 'sm' ? 'aspect-video' : 
                      imageSize === 'md' ? 'aspect-[4/3]' : 
                      'aspect-square'
                    }`}
                  >
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
                  </motion.div>
                </div>

                {/* Meaningful Interpretation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Smart Insights</h3>
                    {results?.meaningfulText && (
                      <button 
                        onClick={() => handleDownloadSummary(results.meaningfulText, 'English Summary')}
                        className="p-1 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/40 hover:text-[#141414]"
                        title="Download Summary"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-white rounded-3xl p-8 h-full border border-[#141414]/5 shadow-sm relative overflow-hidden flex flex-col gap-6">
                    {loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 backdrop-blur-sm z-10">
                        <Loader2 className="w-10 h-10 animate-spin text-[#141414]" />
                        <p className="text-sm font-medium animate-pulse">Analyzing content...</p>
                      </div>
                    ) : error ? (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
                        <p className="text-red-500 font-medium">{error}</p>
                        <button 
                          onClick={() => reset()} 
                          className="text-sm underline underline-offset-4 font-bold"
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="max-w-none text-[#141414] text-sm md:text-base leading-relaxed prose prose-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {results?.meaningfulText || ''}
                          </ReactMarkdown>
                        </div>
                        {results?.urduSummary && (
                          <div className="pt-6 border-t border-[#141414]/5">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30">Urdu Summary (اردو خلاصہ)</h4>
                              <button 
                                onClick={() => handleDownloadSummary(results.urduSummary, 'Urdu Summary')}
                                className="p-1 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/40 hover:text-[#141414]"
                                title="Download Urdu Summary"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="max-w-none text-[#141414] text-lg md:text-xl leading-relaxed text-right dir-rtl font-serif prose prose-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {results.urduSummary}
                              </ReactMarkdown>
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

              {/* Q&A Section */}
              <div className="space-y-6 pt-12 border-t border-[#141414]/5">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold">Ask about this document</h3>
                  <p className="text-sm text-[#141414]/60">Engage in a Q&A session to find specific information.</p>
                </div>

                <form onSubmit={handleAskQuestion} className="relative max-w-2xl mx-auto flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      placeholder="e.g., What is in the first chapter?"
                      className="w-full bg-white border border-[#141414]/10 rounded-2xl px-6 py-4 pr-12 focus:outline-none focus:border-[#141414] transition-colors shadow-sm"
                      disabled={isAsking}
                    />
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                        isListening 
                          ? 'bg-red-500 text-white animate-pulse' 
                          : 'text-[#141414]/40 hover:text-[#141414] hover:bg-[#141414]/5'
                      }`}
                      title={isListening ? "Stop Listening" : "Voice Input"}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isAsking || !currentQuestion.trim()}
                    className="px-8 bg-[#141414] text-white rounded-2xl font-bold hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-sm"
                  >
                    {isAsking ? <Loader2 className="w-5 h-5 animate-spin" /> : "Ask"}
                  </button>
                </form>

                <div className="space-y-4 max-w-2xl mx-auto">
                  <AnimatePresence>
                    {qaHistory.map((qa, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border border-[#141414]/5 rounded-3xl p-6 shadow-sm space-y-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30">Question</p>
                            <p className="font-bold text-[#141414]">{qa.question}</p>
                          </div>
                          <button
                            onClick={() => handleDownloadAnswer(qa)}
                            className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/40 hover:text-[#141414]"
                            title="Download Answer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-1 pt-4 border-t border-[#141414]/5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30">Answer</p>
                          <div className="prose prose-sm max-w-none text-[#141414]/80">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {qa.answer}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Voice Feedback Overlay */}
      <AnimatePresence>
        {voiceFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-[#141414] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium tracking-tight">{voiceFeedback}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Voice Button Removed - Integrated into Chat */}

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
