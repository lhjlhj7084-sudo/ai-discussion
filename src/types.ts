export type ExpertType = 'RESEARCH' | 'BUSINESS' | 'REGULATION';
export type DiscussionPhase = 'PRESENTATION' | 'REBUTTAL' | 'CLOSING';

export interface Expert {
  id: ExpertType;
  name: string;
  role: string;
  description: string;
  color: string;
}

export interface Message {
  expertId: ExpertType;
  content: string;
  round: number;
  phase: DiscussionPhase;
}

export interface FileContext {
  name: string;
  content: string;
  type: string;
}

export interface DiscussionState {
  topic: string;
  messages: Message[];
  summary: string;
  isProcessing: boolean;
  totalRounds: number;
  currentRound: number;
  currentPhase: DiscussionPhase;
  currentExpertIndex: number;
  fileContexts: FileContext[];
}
