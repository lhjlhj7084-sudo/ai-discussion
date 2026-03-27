import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  User, 
  Briefcase, 
  ShieldCheck, 
  Microscope, 
  Download, 
  Copy, 
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  FileText,
  Paperclip,
  X,
  Settings,
  Key,
  Info
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { ExpertType, Message, FileContext, DiscussionPhase } from './types';
import { EXPERTS, generateExpertOpinion, generateSummary } from './services/geminiService';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalRounds, setTotalRounds] = useState(3);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<DiscussionPhase>('PRESENTATION');
  const [currentExpertIndex, setCurrentExpertIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [files, setFiles] = useState<FileContext[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const expertOrder: ExpertType[] = ['RESEARCH', 'BUSINESS', 'REGULATION'];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    setIsUploading(true);
    const newFiles: FileContext[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        let content = '';
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';
          for (let j = 1; j <= pdf.numPages; j++) {
            const page = await pdf.getPage(j);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }
          content = fullText;
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = result.value;
        } else if (file.type === 'text/plain') {
          content = await file.text();
        } else {
          setError(`${file.name}은(는) 지원되지 않는 파일 형식입니다. (PDF, DOCX, TXT만 가능)`);
          continue;
        }

        newFiles.push({
          name: file.name,
          content,
          type: file.type
        });
      } catch (err) {
        console.error(err);
        setError(`${file.name} 파싱 중 오류가 발생했습니다.`);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startDiscussion = async () => {
    if (!topic.trim()) return;
    
    setMessages([]);
    setSummary('');
    setError(null);
    setIsProcessing(true);
    setCurrentRound(1);
    setCurrentPhase('PRESENTATION');
    setCurrentExpertIndex(0);

    try {
      await runDiscussion(topic, 1, 'PRESENTATION', 0, []);
    } catch (err) {
      console.error(err);
      setError('토론 중 오류가 발생했습니다. API 키가 설정되어 있는지 확인해 주세요.');
      setIsProcessing(false);
    }
  };

  const runDiscussion = async (
    currentTopic: string, 
    round: number, 
    phase: DiscussionPhase,
    expertIdx: number, 
    history: Message[]
  ) => {
    if (round > totalRounds) {
      const finalSummary = await generateSummary(currentTopic, history, files);
      setSummary(finalSummary);
      setIsProcessing(false);
      return;
    }

    const expertId = expertOrder[expertIdx];
    const expert = EXPERTS[expertId];
    
    const opinion = await generateExpertOpinion(currentTopic, expert, history, round, totalRounds, phase, files);
    
    const newMessage: Message = {
      expertId,
      content: opinion,
      round,
      phase
    };

    const updatedHistory = [...history, newMessage];
    setMessages(updatedHistory);

    // Next step logic
    let nextRound = round;
    let nextPhase = phase;
    let nextExpertIdx = expertIdx + 1;
    
    if (nextExpertIdx >= expertOrder.length) {
      nextExpertIdx = 0;
      
      // Phase transition logic
      if (phase === 'PRESENTATION') {
        if (totalRounds > 1) {
          nextPhase = 'REBUTTAL';
        } else {
          nextPhase = 'CLOSING';
        }
      } else if (phase === 'REBUTTAL') {
        if (round >= totalRounds - 1) {
          nextPhase = 'CLOSING';
        }
      }
      
      nextRound += 1;
    }

    setCurrentRound(nextRound);
    setCurrentPhase(nextPhase);
    setCurrentExpertIndex(nextExpertIdx);

    setTimeout(() => {
      runDiscussion(currentTopic, nextRound, nextPhase, nextExpertIdx, updatedHistory);
    }, 1000);
  };

  const copyToClipboard = () => {
    const text = messages.map(m => 
      `[라운드 ${m.round} - ${getPhaseName(m.phase)}] ${EXPERTS[m.expertId].name} (${EXPERTS[m.expertId].role}): ${m.content}`
    ).join('\n\n') + `\n\n--- 최종 요약 ---\n\n${summary}`;
    
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const downloadResult = () => {
    const text = messages.map(m => 
      `[라운드 ${m.round} - ${getPhaseName(m.phase)}] ${EXPERTS[m.expertId].name} (${EXPERTS[m.expertId].role}): ${m.content}`
    ).join('\n\n') + `\n\n--- 최종 요약 ---\n\n${summary}`;
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_전문가_토론_${topic.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getExpertIcon = (id: ExpertType) => {
    switch (id) {
      case 'RESEARCH': return <Microscope className="w-5 h-5" />;
      case 'BUSINESS': return <Briefcase className="w-5 h-5" />;
      case 'REGULATION': return <ShieldCheck className="w-5 h-5" />;
    }
  };

  const getPhaseName = (phase: DiscussionPhase) => {
    switch (phase) {
      case 'PRESENTATION': return '의견 제시';
      case 'REBUTTAL': return '상호 반박';
      case 'CLOSING': return '최종 요약';
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="bg-[#1E293B]/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <RefreshCw className={`w-6 h-6 ${isProcessing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">AI 전문가 패널 토론</h1>
              <div className="flex items-center gap-2 text-[10px] text-blue-400 font-mono uppercase tracking-widest">
                <Key className="w-3 h-3" />
                {process.env.GEMINI_API_KEY ? 'API 연결됨' : 'API 키 필요'}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {messages.length > 0 && !isProcessing && (
              <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10">
                <button 
                  onClick={copyToClipboard}
                  className="p-2.5 hover:bg-white/10 rounded-full transition-all relative group"
                  title="클립보드 복사"
                >
                  {copySuccess ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-gray-400 group-hover:text-white" />}
                </button>
                <button 
                  onClick={downloadResult}
                  className="p-2.5 hover:bg-white/10 rounded-full transition-all group"
                  title="결과 다운로드"
                >
                  <Download className="w-5 h-5 text-gray-400 group-hover:text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Configuration Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          <div className="lg:col-span-8 bg-[#1E293B] rounded-3xl p-8 border border-white/5 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-[0.2em]">토론 주제 설정</h2>
              <div className="flex items-center gap-4">
                <label className="text-xs font-medium text-gray-400">총 라운드: {totalRounds}</label>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(parseInt(e.target.value))}
                  disabled={isProcessing}
                  className="w-24 accent-blue-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="relative">
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="토론할 주제를 입력하세요 (예: AI 윤리 가이드라인의 필요성)"
                  disabled={isProcessing}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all disabled:opacity-50 placeholder:text-gray-600"
                  onKeyDown={(e) => e.key === 'Enter' && startDiscussion()}
                />
                <button 
                  onClick={startDiscussion}
                  disabled={isProcessing || !topic.trim()}
                  className="absolute right-3 top-3 bottom-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-8 rounded-xl font-bold transition-all flex items-center gap-2 shadow-xl shadow-blue-600/20 active:scale-95"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  <span>토론 시작</span>
                </button>
              </div>

              {/* File Upload Area */}
              <div className="flex flex-wrap gap-3 items-center">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  <span>참고 문서 첨부 (PDF, DOCX, TXT)</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                />
                
                <div className="flex flex-wrap gap-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg text-xs">
                      <FileText className="w-3 h-3 text-blue-400" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button onClick={() => removeFile(idx)} className="hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 border border-white/10 shadow-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-white/90 font-bold text-lg mb-2">토론 프로세스</h3>
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-3 text-sm text-white/80">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">1</div>
                  <span>의견 제시 (초기 관점 정립)</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/80">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">2</div>
                  <span>상호 반박 (논리적 검증)</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/80">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">3</div>
                  <span>최종 요약 (결론 도출)</span>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 mt-6">
              <div className="flex items-center gap-3 mb-3">
                <Info className="w-4 h-4 text-white/70" />
                <span className="text-xs font-bold uppercase tracking-wider">토론 정보</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">설정 라운드</span>
                  <span className="font-mono">{totalRounds}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">첨부 문서</span>
                  <span className="font-mono">{files.length}개</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Status Bar */}
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-2xl px-6 py-4 text-blue-400"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping absolute" />
                <div className="w-3 h-3 bg-blue-500 rounded-full relative" />
              </div>
              <span className="text-sm font-bold tracking-wide">
                {getPhaseName(currentPhase)} 단계 - {EXPERTS[expertOrder[currentExpertIndex]].name} 발언 중...
              </span>
            </div>
            <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${((currentRound - 1) * 3 + currentExpertIndex + 1) / (totalRounds * 3) * 100}%` }}
              />
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mb-8 flex items-center gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl px-6 py-4 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        {/* Discussion Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Messages Column */}
          <div className="lg:col-span-8 space-y-6">
            <div 
              ref={scrollRef}
              className="space-y-8 max-h-[80vh] overflow-y-auto pr-6 custom-scrollbar scroll-smooth"
            >
              <AnimatePresence initial={false}>
                {messages.length === 0 && !isProcessing && (
                  <div className="text-center py-32 text-gray-600">
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5">
                      <RefreshCw className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-400 mb-2">토론 준비 완료</h3>
                    <p className="text-sm">주제를 입력하고 전문가들의 분석을 확인하세요.</p>
                  </div>
                )}
                {messages.map((msg, idx) => {
                  const expert = EXPERTS[msg.expertId];
                  return (
                    <motion.div 
                      key={`${msg.round}-${msg.expertId}-${idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-6 group"
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${expert.color.replace('text', 'bg').replace('400', '500/10')} ${expert.color} border border-white/5`}>
                        {getExpertIcon(msg.expertId)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`font-black text-sm uppercase tracking-wider ${expert.color}`}>{expert.name}</span>
                          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{expert.role}</span>
                          <span className="ml-auto text-[10px] font-black bg-white/5 text-gray-500 px-2 py-0.5 rounded-full border border-white/5">
                            {getPhaseName(msg.phase)}
                          </span>
                        </div>
                        <div className="bg-[#1E293B] border border-white/5 rounded-3xl rounded-tl-none p-6 shadow-xl text-[16px] leading-[1.6] text-gray-300">
                          {msg.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Sidebar: Summary & Experts */}
          <div className="lg:col-span-4 space-y-8">
            {/* Summary Card */}
            <div className="bg-[#1E293B] rounded-3xl p-8 shadow-2xl border border-white/5 sticky top-28">
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <ChevronRight className="w-4 h-4" />
                토론 최종 요약
              </h3>
              {summary ? (
                <div className="prose prose-invert prose-sm max-w-none text-gray-400 whitespace-pre-wrap leading-relaxed">
                  {summary}
                </div>
              ) : (
                <div className="text-gray-600 text-sm italic py-10 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                  {isProcessing ? '전문가들이 토론 내용을 정리하고 있습니다...' : '토론이 완료되면 AI 요약이 생성됩니다.'}
                </div>
              )}
            </div>

            {/* Expert Profiles */}
            <div className="bg-[#1E293B] rounded-3xl p-8 shadow-2xl border border-white/5">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">참여 전문가 패널</h3>
              <div className="space-y-6">
                {expertOrder.map(id => {
                  const expert = EXPERTS[id];
                  return (
                    <div key={id} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${expert.color.replace('text', 'bg').replace('400', '500/10')} ${expert.color}`}>
                        {getExpertIcon(id)}
                      </div>
                      <div>
                        <div className="text-sm font-black text-white mb-1">{expert.name}</div>
                        <div className="text-[11px] text-gray-500 leading-relaxed font-medium">{expert.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3B82F6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
          cursor: pointer;
        }
      `}} />
    </div>
  );
}
