export type Tab = 'home' | 'must-do' | 'nice-to-do' | 'ask-me' | 'fun-facts';

export interface Activity {
  id: string;
  name: string;
  location?: string;
  vibe: string;
  type: 'must-do' | 'nice-to-do';
  date?: string;
  dateNumber?: number;
  dateId?: string; // Unique ID for the date (e.g., "May 27")
  time?: string;
  imageUrl?: string;
  createdBy?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  imageUrl?: string;
  timestamp: string;
  modelUsed?: 'gemini' | 'gemma';
  isOffline?: boolean;
}

export interface Stat {
  label: string;
  value: string;
  description: string;
  icon: string;
}

export interface Reminder {
  id: string;
  text: string;
  completed: boolean;
  category: 'packing' | 'check' | 'other';
}
