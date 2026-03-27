import { GoogleGenAI } from "@google/genai";
import { Message, ExpertType, Expert, FileContext, DiscussionPhase } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const EXPERTS: Record<ExpertType, Expert> = {
  RESEARCH: {
    id: 'RESEARCH',
    name: '아리스 박사',
    role: 'AI 연구 과학자',
    description: '기술적 타당성, 최신 모델(SOTA), 알고리즘 혁신에 집중합니다.',
    color: 'text-blue-400'
  },
  BUSINESS: {
    id: 'BUSINESS',
    name: '사라 첸',
    role: 'AI 사업 개발 전문가',
    description: '시장 적합성, 투자 대비 수익(ROI), 확장성 및 상업적 생존력에 집중합니다.',
    color: 'text-emerald-400'
  },
  REGULATION: {
    id: 'REGULATION',
    name: '마커스 쏜',
    role: 'AI 정책 및 윤리 전문가',
    description: '법적 준수, 윤리적 함의, 사회적 영향 및 규제 프레임워크에 집중합니다.',
    color: 'text-amber-400'
  }
};

const PHASE_NAMES: Record<DiscussionPhase, string> = {
  PRESENTATION: '의견 제시',
  REBUTTAL: '상호 반박',
  CLOSING: '최종 요약 및 발언'
};

export async function generateExpertOpinion(
  topic: string,
  expert: Expert,
  history: Message[],
  round: number,
  totalRounds: number,
  phase: DiscussionPhase,
  fileContexts: FileContext[]
): Promise<string> {
  const historyText = history
    .map(m => `[${PHASE_NAMES[m.phase]}] ${EXPERTS[m.expertId].name} (${EXPERTS[m.expertId].role}): ${m.content}`)
    .join('\n\n');

  const contextText = fileContexts.length > 0 
    ? `\n\n첨부 문서 문맥:\n${fileContexts.map(f => `--- 파일명: ${f.name} ---\n${f.content.substring(0, 3000)}...`).join('\n\n')}`
    : '';

  const phaseInstruction = {
    PRESENTATION: '주제에 대한 당신의 전문적인 초기 의견을 제시하세요.',
    REBUTTAL: '다른 전문가들의 의견 중 동의하지 않거나 보완이 필요한 부분을 지적하고 반박하세요.',
    CLOSING: '지금까지의 논의를 바탕으로 당신의 입장을 정리하고 최종 결론을 내리세요.'
  }[phase];

  const prompt = `
    당신은 ${expert.name} (${expert.role})입니다. 
    전문 분야: ${expert.description}
    
    현재 토론 주제: "${topic}"
    현재 단계: ${PHASE_NAMES[phase]} (전체 ${totalRounds}라운드 중 ${round}라운드)
    ${contextText}
    
    이전 토론 내용:
    ${historyText || "토론이 이제 막 시작되었습니다."}
    
    지침:
    - ${phaseInstruction}
    - 제공된 문서 내용이 주제와 관련이 있다면 적극적으로 인용하세요.
    - 철저히 캐릭터를 유지하세요.
    - 통찰력 있게 2-4문장으로 답변하세요.
    - 다른 사람의 말을 그대로 반복하지 마세요.
    - 반드시 한국어로 답변하세요.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash-latest",
    contents: prompt,
  });

  return response.text || "의견을 생성하지 못했습니다.";
}

export async function generateSummary(topic: string, history: Message[], fileContexts: FileContext[]): Promise<string> {
  const historyText = history
    .map(m => `[${PHASE_NAMES[m.phase]}] ${EXPERTS[m.expertId].name}: ${m.content}`)
    .join('\n\n');

  const contextText = fileContexts.length > 0 
    ? `\n\n참고 문서: ${fileContexts.map(f => f.name).join(', ')}`
    : '';

  const prompt = `
    다음 AI 전문가 패널 토론 내용을 요약해 주세요. 주제: "${topic}"
    ${contextText}
    
    토론 내용:
    ${historyText}
    
    지침:
    - 구조화된 한국어 요약을 제공하세요.
    - 포함 내용: 
      1. 각 관점별(연구, 사업, 규제) 핵심 주장.
      2. 주요 합의 사항.
      3. 주요 쟁점 및 해결되지 않은 문제.
      4. 토론 내용과 제공된 문서를 바탕으로 한 최종 결론 및 향후 전망.
    - 마크다운 형식을 사용하세요.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro-latest",
    contents: prompt,
  });

  return response.text || "요약을 생성하지 못했습니다.";
}
