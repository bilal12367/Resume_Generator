export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export type JobStatus = 'Basic Information' | 'ATS Data Generated' | 'PDF Generated' | 'Applied';

export interface JobApplication {
  id: string; // e.g. JOB-101
  title: string;
  company: string;
  status: JobStatus;
  dateDaysAgo: string; // e.g. "2 days ago"
  description: string;
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface AgentTraces {
  thinking: string[];
  action: string[];
  observation: string[];
  answering: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  jobIds?: string[];
  traces?: AgentTraces;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  time: string;
  messages: ChatMessage[];
  tokenUsage?: TokenUsage;
}

export interface UserProfileJSON {
  id: string;
  name: string;
  jsonData: any;
  created_at: string;
}
