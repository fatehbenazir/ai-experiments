import React, { Component, useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  MapPin, 
  Sparkles, 
  Lightbulb, 
  MessageSquare,
  ChevronRight, 
  Send, 
  Search,
  ArrowLeft,
  X,
  CheckCircle2,
  Circle,
  Calendar,
  Pencil,
  Settings,
  Cpu,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Tab, Activity, ChatMessage, Reminder } from './types';
import { cn } from './lib/utils';
import { auth, db, signInWithGoogle, handleRedirectResult, signInWithGoogleRedirect } from './firebase';
import { aiService, AIResponse, GemmaStatus } from './services/aiService';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { LogIn, AlertTriangle } from 'lucide-react';

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-error" />
          </div>
          <h1 className="serif-text text-3xl font-bold mb-4 text-on-surface">Something went wrong</h1>
          <p className="text-secondary mb-8 max-w-xs">
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg"
          >
            Refresh Page
          </button>
          {(this as any).state.error && (
            <pre className="mt-8 p-4 bg-surface-container-low rounded-xl text-[10px] text-left overflow-auto max-w-full text-secondary opacity-50">
              {(this as any).state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return (this as any).props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return localStorage.getItem('pathfinder_unlocked') === 'true';
  });
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isAdding, setIsAdding] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState('Nature');
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Itinerary Dates: May 27 - July 7
  const itineraryDates = useMemo(() => {
    const dates = [];
    // May 27-31
    for (let d = 27; d <= 31; d++) dates.push({ id: `May ${d}`, day: d, month: 'May', dateObj: new Date(2026, 4, d) });
    // June 1-30
    for (let d = 1; d <= 30; d++) dates.push({ id: `June ${d}`, day: d, month: 'June', dateObj: new Date(2026, 5, d) });
    // July 1-7
    for (let d = 1; d <= 7; d++) dates.push({ id: `July ${d}`, day: d, month: 'July', dateObj: new Date(2026, 6, d) });
    return dates.map((d, i) => ({ ...d, index: i }));
  }, []);

  const isDateInRange = (dateId: string, startId?: string, endId?: string) => {
    if (!startId) return false;
    if (!endId || startId === endId) return dateId === startId;
    
    const startIndex = itineraryDates.find(d => d.id === startId)?.index ?? -1;
    const endIndex = itineraryDates.find(d => d.id === endId)?.index ?? -1;
    const currentIndex = itineraryDates.find(d => d.id === dateId)?.index ?? -1;
    
    if (startIndex === -1 || endIndex === -1 || currentIndex === -1) return false;
    
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    
    return currentIndex >= min && currentIndex <= max;
  };

  // Fun Facts Calculations
  const stats = {
    totalActivities: activities.length,
    scheduledActivities: activities.filter(a => a.dateId).length,
    completionRate: reminders.length > 0 
      ? Math.round((reminders.filter(r => r.completed).length / reminders.length) * 100) 
      : 0,
    topVibe: activities.length > 0 
      ? Object.entries(activities.reduce((acc, a) => {
          acc[a.vibe] = (acc[a.vibe] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0]
      : 'None',
    uniqueContributors: new Set(activities.map(a => a.createdBy).filter(Boolean)).size
  };

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: "Welcome back! I've curated some new \"Hidden Gems\" in the high desert since we last spoke. Are you looking for a quiet pottery studio or a sunset ridge hike today?",
      timestamp: '10:40 AM',
      modelUsed: 'gemini'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [preferOffline, setPreferOffline] = useState(() => localStorage.getItem('prefer_offline') === 'true');
  const [gemmaStatus, setGemmaStatus] = useState<GemmaStatus>('not_downloaded');
  const [gemmaError, setGemmaError] = useState<string | null>(null);
  const [gemmaSize, setGemmaSize] = useState<'2b' | '4b'>(() => (localStorage.getItem('gemma_current_size') as '2b' | '4b') || '2b');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkGemma = async () => {
      const downloaded = await aiService.isGemmaDownloaded();
      if (downloaded) setGemmaStatus('downloaded');
      else setGemmaStatus('not_downloaded');
    };
    checkGemma();
  }, [gemmaSize]);

  const handleDownloadGemma = async () => {
    setGemmaStatus('downloading');
    setGemmaError(null);
    try {
      await aiService.downloadGemma((progress) => {
        setDownloadProgress(progress);
      });
      setGemmaStatus('downloaded');
    } catch (error: any) {
      setGemmaStatus('error');
      setGemmaError(error.message || "Download failed. Check space or connection.");
      console.error("Gemma download failed:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });

    // Handle redirect result
    handleRedirectResult().catch(err => {
      console.error("Redirect login error:", err);
      if (err.message.includes('missing initial state')) {
        setLoginError("Sign-in redirect failed due to browser restrictions (common in iframes). Please use the 'Sign in with Google' button above or open the app in a new tab.");
      } else {
        setLoginError("Login failed after redirect. Please try again.");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const qActivities = query(collection(db, 'activities'));
    const unsubActivities = onSnapshot(qActivities, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Activity));
      setActivities(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'activities');
    });

    const qReminders = query(collection(db, 'reminders'));
    const unsubReminders = onSnapshot(qReminders, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Reminder));
      setReminders(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'reminders');
    });

    return () => {
      unsubActivities();
      unsubReminders();
    };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (selectedDateId && activeTab === 'home') {
      const element = document.getElementById('daily-plans');
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedDateId, activeTab]);

  const handleAddActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    const formData = new FormData(e.currentTarget);
    const activityData = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
      vibe: selectedVibe,
      type: activeTab === 'must-do' ? 'must-do' : 'nice-to-do',
      dateId: (formData.get('dateId') as string) || (activeTab === 'home' ? (selectedDateId || null) : (editingActivity?.dateId || null)),
      endDateId: formData.get('endDateId') as string || null,
      imageUrl: editingActivity?.imageUrl || 'https://images.unsplash.com/photo-1533628635777-112b2239b1c7?auto=format&fit=crop&q=80&w=400',
      createdBy: user.uid
    };

    try {
      if (editingActivity) {
        await updateDoc(doc(db, 'activities', editingActivity.id), activityData);
      } else {
        await addDoc(collection(db, 'activities'), activityData);
      }
      setIsAdding(false);
      setEditingActivity(null);
    } catch (error) {
      handleFirestoreError(error, editingActivity ? OperationType.UPDATE : OperationType.CREATE, 'activities');
    }
  };

  const deleteActivity = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `activities/${id}`);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    const historyForAI = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    try {
      const response: AIResponse = await aiService.generateResponse(chatInput, historyForAI, preferOffline);
      
      const modelMsg: ChatMessage = {
        role: 'model',
        content: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: response.modelUsed,
        isOffline: response.isOffline
      };

      setChatHistory(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("AI Error:", error);
      const errorMsg: ChatMessage = {
        role: 'model',
        content: "I'm having trouble connecting to my travel journals right now. If you're offline, make sure you've downloaded the offline guide in settings!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const toggleReminder = async (id: string) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    try {
      await updateDoc(doc(db, 'reminders', id), { completed: !reminder.completed });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reminders/${id}`);
    }
  };

  const assignActivityToDate = async (id: string) => {
    if (!selectedDateId) return;
    try {
      await updateDoc(doc(db, 'activities', id), { dateId: selectedDateId });
      setIsPicking(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `activities/${id}`);
    }
  };

  const unassignActivity = async (id: string) => {
    try {
      await updateDoc(doc(db, 'activities', id), { dateId: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `activities/${id}`);
    }
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.toUpperCase() === 'PATH') {
      setIsUnlocked(true);
      localStorage.setItem('pathfinder_unlocked', 'true');
      setPasscodeError(false);
    } else {
      setPasscodeError(true);
      setPasscode('');
      setTimeout(() => setPasscodeError(false), 2000);
    }
  };

  const renderPasscodeScreen = () => (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-surface-container-low p-10 rounded-[2.5rem] shadow-xl border border-outline-variant/10"
      >
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-8 mx-auto">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <h1 className="serif-text text-4xl font-bold mb-2">Pathfinder</h1>
        <p className="text-secondary mb-10 font-medium opacity-70">Enter the 4-letter secret to begin your journey.</p>
        
        <form onSubmit={handlePasscodeSubmit} className="space-y-6">
          <div className="relative">
            <input 
              type="text"
              maxLength={4}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.toUpperCase())}
              placeholder="••••"
              className={cn(
                "w-full bg-surface-container-highest border-none border-b-2 px-0 py-4 text-center text-4xl font-headline tracking-[0.5em] placeholder:text-outline-variant/30 focus:ring-0 transition-all uppercase",
                passcodeError ? "border-error text-error animate-shake" : "border-outline/20 focus:border-primary"
              )}
              autoFocus
            />
            {passcodeError && (
              <motion.p 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-error text-xs font-bold mt-2 uppercase tracking-widest"
              >
                Incorrect Passcode
              </motion.p>
            )}
          </div>
          
          <button 
            type="submit"
            disabled={passcode.length < 4}
            className="w-full py-5 bg-primary text-white rounded-2xl font-headline text-lg font-bold shadow-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
          >
            Unlock Adventure
          </button>
        </form>
      </motion.div>
      <p className="mt-8 text-[10px] text-outline-variant font-bold uppercase tracking-[0.3em]">Curated by Benazir</p>
    </div>
  );

  const renderPickActivity = () => {
    const unassignedMustDo = activities.filter(a => a.type === 'must-do' && !a.dateId);
    const unassignedNiceToDo = activities.filter(a => a.type === 'nice-to-do' && !a.dateId);

    return (
      <div className="space-y-10 pb-32">
        <header className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setIsPicking(false)}
            className="p-2 bg-surface-container-low rounded-full hover:bg-surface-container-highest transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-primary font-label text-[10px] uppercase tracking-widest font-bold">Planning for {selectedDateId}</p>
            <h2 className="serif-text text-3xl font-bold">Pick an Adventure</h2>
          </div>
        </header>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary w-5 h-5" />
              <h3 className="serif-text text-xl font-bold">Must Do's</h3>
            </div>
            <button 
              onClick={() => {
                setIsPicking(false);
                setIsAdding(true);
              }}
              className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Create New
            </button>
          </div>
          {unassignedMustDo.length === 0 ? (
            <p className="text-secondary italic text-sm px-4">All must-dos are scheduled!</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {unassignedMustDo.map(activity => (
                <div key={activity.id} className="bg-surface-container-low p-4 rounded-2xl flex items-center gap-4 group">
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={activity.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-on-surface">{activity.name}</h4>
                    <p className="text-xs text-secondary">{activity.location}</p>
                  </div>
                  <button 
                    onClick={() => assignActivityToDate(activity.id)}
                    className="bg-primary text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    Pick
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Lightbulb className="text-secondary w-5 h-5" />
            <h3 className="serif-text text-xl font-bold">Nice to Do's</h3>
          </div>
          {unassignedNiceToDo.length === 0 ? (
            <p className="text-secondary italic text-sm px-4">All nice-to-dos are scheduled!</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {unassignedNiceToDo.map(activity => (
                <div key={activity.id} className="bg-surface-container-low p-4 rounded-2xl flex items-center gap-4 group">
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={activity.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-on-surface">{activity.name}</h4>
                    <p className="text-xs text-secondary">{activity.location}</p>
                  </div>
                  <button 
                    onClick={() => assignActivityToDate(activity.id)}
                    className="bg-secondary text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    Pick
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-12">
      <section className="relative h-[400px] -mx-6 mb-12 overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1000" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          alt="Mountain Landscape"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
        <div className="absolute bottom-8 left-8 right-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="font-label text-white/80 text-xs uppercase tracking-[0.3em] font-bold mb-2 block">The Grand Adventure</span>
            <h1 className="serif-text text-5xl md:text-7xl text-white font-bold leading-[0.9] tracking-tighter">
              Pathfinder
            </h1>
          </motion.div>
        </div>
      </section>

      <section className="bg-surface-container-low rounded-xl p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-label text-xs font-bold uppercase tracking-widest text-secondary opacity-60">Itinerary Calendar</h3>
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">May 27 - July 7</span>
        </div>
        <div className="grid grid-cols-7 gap-y-4 gap-x-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-[10px] font-bold text-center text-outline-variant uppercase tracking-widest pb-2">
              {day}
            </div>
          ))}
          {/* Padding for May 27 (Wednesday) */}
          {[...Array(3)].map((_, i) => <div key={`pad-${i}`} />)}
          {itineraryDates.map((date) => {
            const hasActivity = activities.some(a => isDateInRange(date.id, a.dateId, a.endDateId));
            const isSelected = selectedDateId === date.id;
            const isWeekend = date.dateObj.getDay() === 0 || date.dateObj.getDay() === 6;
            
            return (
              <button 
                key={date.id} 
                onClick={() => {
                  const isAlreadySelected = selectedDateId === date.id;
                  setSelectedDateId(isAlreadySelected ? null : date.id);
                  if (!hasActivity && !isAlreadySelected) {
                    setIsPicking(true);
                  }
                }}
                className="flex flex-col items-center group"
              >
                <span className={cn(
                  "w-10 h-10 flex flex-col items-center justify-center rounded-full text-xs transition-all relative",
                  isSelected ? "bg-primary text-white font-bold shadow-md" : 
                  hasActivity ? "bg-primary-container text-white font-bold" :
                  "text-on-surface font-medium hover:bg-surface-container-highest",
                  isWeekend && !isSelected && !hasActivity && "bg-surface-container text-on-surface/60"
                )}>
                  <span className="text-[8px] opacity-60 uppercase leading-none mb-0.5">{date.month.substring(0, 3)}</span>
                  <span className="leading-none">{date.day}</span>
                  {hasActivity && !isSelected && (
                    <span className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {selectedDateId && (
          <button 
            onClick={() => setSelectedDateId(null)}
            className="mt-6 text-xs text-primary font-bold uppercase tracking-widest flex items-center gap-1 mx-auto"
          >
            <X className="w-3 h-3" /> Clear Filter
          </button>
        )}
      </section>

      <section id="daily-plans">
        <div className="flex items-center justify-between mb-6">
          <h3 className="serif-text text-2xl font-bold">
            {selectedDateId ? `Planned for ${selectedDateId}` : 'Reminders for Today'}
          </h3>
          {!selectedDateId && (
            <span className="font-label text-primary text-[10px] font-bold uppercase tracking-widest">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </span>
          )}
        </div>

        {selectedDateId ? (
          <div className="space-y-4">
            {activities.filter(a => a.dateId === selectedDateId).map((activity) => (
              <motion.div 
                layout
                key={activity.id} 
                className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-outline-variant/10 group hover:shadow-md transition-shadow"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={activity.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest",
                      activity.type === 'must-do' ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                    )}>
                      {activity.type === 'must-do' ? 'Must Do' : 'Nice to Do'}
                    </span>
                    <span className="text-[9px] font-bold text-outline-variant uppercase tracking-tighter">{activity.vibe}</span>
                  </div>
                  <h4 className="font-bold text-on-surface leading-tight">{activity.name}</h4>
                  <div className="flex items-center gap-1 text-[10px] text-secondary mt-1">
                    <MapPin className="w-3 h-3" />
                    {activity.location}
                  </div>
                </div>
                  <div className="flex flex-col gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingActivity(activity);
                      setSelectedVibe(activity.vibe);
                      setIsAdding(true);
                    }}
                    className="p-2 bg-surface-container-highest rounded-full text-secondary hover:text-primary transition-colors"
                    title="Edit activity"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      unassignActivity(activity.id);
                    }}
                    className="p-2 bg-surface-container-highest rounded-full text-secondary hover:text-primary transition-colors"
                    title="Remove from day"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPicking(true);
                    }}
                    className="p-2 bg-surface-container-highest rounded-full text-secondary hover:text-primary transition-colors"
                    title="Change activity"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
            {activities.filter(a => a.dateId === selectedDateId).length === 0 && (
              <div className="text-center py-12 bg-surface-container-low rounded-2xl border-2 border-dashed border-outline-variant/20">
                <Sparkles className="w-8 h-8 text-outline-variant/40 mx-auto mb-3" />
                <p className="text-secondary italic text-sm">No plans for this date yet.</p>
                <div className="flex items-center justify-center gap-4 mt-4">
                  <button 
                    onClick={() => setIsPicking(true)}
                    className="text-xs text-primary font-bold uppercase tracking-widest hover:underline"
                  >
                    Pick from List
                  </button>
                  <span className="text-outline-variant text-xs">or</span>
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="text-xs text-primary font-bold uppercase tracking-widest hover:underline"
                  >
                    Create New
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-surface-container-low p-6 rounded-3xl space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="font-label text-xs font-bold uppercase tracking-widest text-secondary">Packing List</h4>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {reminders.filter(r => r.category === 'packing' && r.completed).length}/{reminders.filter(r => r.category === 'packing').length}
                </span>
              </div>
              <div className="space-y-3">
                {reminders.filter(r => r.category === 'packing').map(reminder => (
                  <button 
                    key={reminder.id}
                    onClick={() => toggleReminder(reminder.id)}
                    className="flex items-center gap-3 w-full text-left group"
                  >
                    {reminder.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-outline-variant group-hover:text-primary transition-colors" />
                    )}
                    <span className={cn(
                      "text-sm font-medium transition-all",
                      reminder.completed ? "text-secondary/50 line-through" : "text-on-surface"
                    )}>
                      {reminder.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-container-low p-6 rounded-3xl space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="font-label text-xs font-bold uppercase tracking-widest text-secondary">Pre-Trip Checks</h4>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {reminders.filter(r => r.category === 'check' && r.completed).length}/{reminders.filter(r => r.category === 'check').length}
                </span>
              </div>
              <div className="space-y-3">
                {reminders.filter(r => r.category === 'check').map(reminder => (
                  <button 
                    key={reminder.id}
                    onClick={() => toggleReminder(reminder.id)}
                    className="flex items-center gap-3 w-full text-left group"
                  >
                    {reminder.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-outline-variant group-hover:text-primary transition-colors" />
                    )}
                    <span className={cn(
                      "text-sm font-medium transition-all",
                      reminder.completed ? "text-secondary/50 line-through" : "text-on-surface"
                    )}>
                      {reminder.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const renderActivityList = (type: 'must-do' | 'nice-to-do') => {
    const filtered = activities.filter(a => a.type === type);

    return (
      <div className="space-y-8">
        <section className="text-center mb-8">
          <p className="text-primary font-label text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
            {type === 'must-do' ? 'Summer Itinerary' : 'Curation'}
          </p>
          <h2 className="serif-text text-3xl font-bold leading-tight">
            {type === 'must-do' ? 'May 27 — July 07' : 'Nice-to-Do Activities'}
          </h2>
          <p className="text-secondary text-sm mt-2 font-medium opacity-70 italic">
            {type === 'must-do' ? 'Curating your sun-drenched memories' : 'Small moments that make the experience yours'}
          </p>
        </section>

        <section className="mt-12">
          <h3 className="serif-text text-xl font-bold text-on-surface mb-4">
            Current Gems
          </h3>
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-surface-container-low rounded-xl border-2 border-dashed border-outline-variant/20">
              <p className="text-secondary italic">No activities found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((activity) => (
                <motion.div 
                  layout
                  key={activity.id}
                  className="bg-surface-container-lowest p-5 rounded-xl shadow-[0_10px_30px_rgba(28,28,21,0.04)] flex flex-col justify-between min-h-[160px] relative group"
                >
                  <button 
                    onClick={() => deleteActivity(activity.id)}
                    className="absolute top-2 right-2 p-1 text-outline-variant opacity-0 group-hover:opacity-100 transition-opacity hover:text-error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      setEditingActivity(activity);
                      setSelectedVibe(activity.vibe);
                      setIsAdding(true);
                    }}
                    className="absolute top-2 right-8 p-1 text-outline-variant opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="text-primary w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">{activity.vibe}</span>
                    </div>
                    <h4 className="serif-text font-bold text-lg">{activity.name}</h4>
                    <div className="flex items-center gap-1 text-xs text-secondary mt-1">
                      <MapPin className="w-3 h-3" />
                      {activity.location}
                    </div>
                  </div>
                  <div className="flex justify-between items-end mt-4">
                    <div className="flex -space-x-2">
                      <img className="w-6 h-6 rounded-full ring-2 ring-surface" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex items-center gap-2">
                      {activity.dateId ? (
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest">
                          Scheduled: {activity.dateId}
                        </span>
                      ) : (
                        <span className="bg-surface-container-highest text-secondary px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest">
                          Unscheduled
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-outline uppercase tracking-tighter">
                        {activity.date} {activity.time}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 mb-8 p-8 border-l-2 border-outline-variant/20 italic text-secondary serif-text text-lg leading-relaxed">
          "The best journeys are those that tell a story before they even begin."
        </div>
      </div>
    );
  };

  const renderAddForm = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <section className="mb-10">
        <span className="text-primary font-label text-sm uppercase tracking-[0.2em] font-bold mb-2 block">
          {editingActivity ? 'Modify Entry' : 'New Entry'}
        </span>
        <h2 className="serif-text text-4xl font-bold text-on-surface tracking-tight leading-tight">
          {editingActivity ? 'Edit Adventure' : 'Add an Adventure'}
        </h2>
        <p className="text-secondary mt-4 text-lg leading-relaxed">
          {editingActivity 
            ? 'Refine your curated journal of must-do experiences.' 
            : 'Capture a new memory for your curated journal of must-do experiences.'}
        </p>
      </section>

      <div className="bg-surface-container-low p-8 rounded-xl space-y-8 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl"></div>
        <form onSubmit={handleAddActivity} className="space-y-10 relative z-10">
          <div className="space-y-2">
            <label className="block font-label text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Activity Name *</label>
            <input 
              name="name"
              defaultValue={editingActivity?.name}
              className="w-full bg-surface-container-highest border-none border-b-2 border-outline/20 focus:border-primary focus:ring-0 px-0 py-4 text-xl font-headline placeholder:text-outline-variant/60 transition-all" 
              placeholder="What are we doing?" 
              required 
              type="text"
            />
          </div>
          <div className="space-y-2">
            <label className="block font-label text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Location (Optional)</label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-0 text-outline-variant w-5 h-5" />
              <input 
                name="location"
                defaultValue={editingActivity?.location}
                className="w-full bg-surface-container-highest border-none border-b-2 border-outline/20 focus:border-primary focus:ring-0 pl-8 py-4 text-lg font-body placeholder:text-outline-variant/60 transition-all" 
                placeholder="Where is this gem?" 
                type="text"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block font-label text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Start Date</label>
              <select 
                name="dateId"
                defaultValue={editingActivity?.dateId || selectedDateId || ""}
                className="w-full bg-surface-container-highest border-none border-b-2 border-outline/20 focus:border-primary focus:ring-0 px-0 py-4 text-lg font-body transition-all"
              >
                <option value="">Unscheduled</option>
                {itineraryDates.map(d => (
                  <option key={d.id} value={d.id}>{d.id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block font-label text-xs uppercase tracking-widest text-on-surface-variant font-semibold">End Date (Optional)</label>
              <select 
                name="endDateId"
                defaultValue={editingActivity?.endDateId || ""}
                className="w-full bg-surface-container-highest border-none border-b-2 border-outline/20 focus:border-primary focus:ring-0 px-0 py-4 text-lg font-body transition-all"
              >
                <option value="">Same Day</option>
                {itineraryDates.map(d => (
                  <option key={d.id} value={d.id}>{d.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block font-label text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Select the Vibe</label>
            <div className="flex flex-wrap gap-3">
              {['Nature', 'City', 'Adventure', 'Relaxed'].map((vibe) => (
                <button 
                  key={vibe}
                  type="button"
                  onClick={() => setSelectedVibe(vibe)}
                  className={cn(
                    "px-6 py-2.5 rounded-full font-label text-sm font-semibold transition-all active:scale-95",
                    selectedVibe === vibe 
                      ? "bg-primary text-white shadow-md" 
                      : "bg-surface-container-highest text-secondary hover:bg-surface-container-low"
                  )}
                >
                  {vibe}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-6">
            <button 
              type="submit"
              className="w-full py-5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-xl font-headline text-lg font-bold shadow-xl hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <span>{editingActivity ? 'Update Journal' : 'Save to Journal'}</span>
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );

  const renderAskMe = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-8 mt-4">
        <div>
          <p className="font-label text-primary text-[11px] font-bold tracking-[0.2em] uppercase mb-2">Travel Assistant</p>
          <h2 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-on-surface">
            Ask Me anything, <br/><span className="italic text-primary">wanderer.</span>
          </h2>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-3 bg-surface-container-low rounded-full hover:bg-surface-container-highest transition-colors relative"
        >
          <Settings className="w-5 h-5 text-secondary" />
          {gemmaStatus === 'downloaded' && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-primary border-2 border-surface rounded-full" />
          )}
        </button>
      </div>

      <div className="flex-grow space-y-8 chat-scroll overflow-y-auto mb-32 pb-4">
        {chatHistory.map((msg, i) => (
          <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === 'user' ? "items-end ml-auto" : "items-start")}>
            {msg.role === 'model' && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <Sparkles className="text-secondary w-3 h-3" />
                <span className="font-label text-[10px] font-bold uppercase tracking-wider text-secondary">Pathfinder AI</span>
                {msg.modelUsed && (
                  <span className={cn(
                    "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full flex items-center gap-1",
                    msg.modelUsed === 'gemma' ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                  )}>
                    {msg.modelUsed === 'gemma' ? <Cpu className="w-2 h-2" /> : <Wifi className="w-2 h-2" />}
                    {msg.modelUsed}
                  </span>
                )}
                {msg.isOffline && (
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-error/10 text-error flex items-center gap-1">
                    <WifiOff className="w-2 h-2" /> Offline
                  </span>
                )}
              </div>
            )}
            <div className={cn(
              "p-5 rounded-xl shadow-sm font-medium leading-relaxed",
              msg.role === 'user' 
                ? "bg-primary text-white rounded-tr-none editorial-gradient" 
                : "bg-surface-container-low text-on-surface rounded-tl-none"
            )}>
              {msg.content}
              {msg.imageUrl && (
                <div className="mt-4 rounded-xl overflow-hidden aspect-video">
                  <img src={msg.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              )}
            </div>
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-outline mt-2 px-1">
              {msg.timestamp}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 text-secondary animate-pulse">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Pathfinder AI is thinking...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-40">
        <div className="bg-surface-container-highest/90 backdrop-blur-xl p-2 rounded-full shadow-lg border border-outline-variant/10 flex items-center gap-2">
          <button className="p-3 text-secondary hover:bg-surface-container-low rounded-full transition-colors">
            <Plus className="w-5 h-5" />
          </button>
          <input 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-grow bg-transparent border-none focus:ring-0 text-on-surface placeholder-on-surface-variant/50 font-medium px-2" 
            placeholder="Tell me more about..." 
            type="text"
          />
          <button 
            onClick={handleSendMessage}
            className="bg-primary text-white p-3 rounded-full shadow-sm editorial-gradient scale-100 active:scale-95 transition-transform"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface-container-low w-full max-w-md rounded-3xl p-8 shadow-2xl border border-outline-variant/10"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="serif-text text-2xl font-bold">AI Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-surface-container-highest rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-8">
                {!(navigator as any).gpu && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-start gap-3">
                    <WifiOff className="w-5 h-5 text-error shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-error">WebGPU Not Detected</h4>
                      <p className="text-[11px] text-error/80 leading-relaxed">
                        Your browser doesn't support WebGPU. Offline AI (Gemma) requires Chrome or Edge. On iPhone/Safari, please use the <strong>Gemini (Online)</strong> model instead.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-on-surface">Offline Mode</h4>
                    <p className="text-xs text-secondary">Prefer on-device AI when available</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newVal = !preferOffline;
                      setPreferOffline(newVal);
                      localStorage.setItem('prefer_offline', newVal.toString());
                    }}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      preferOffline ? "bg-primary" : "bg-surface-container-highest"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                      preferOffline ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="p-6 bg-surface-container-highest rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cpu className="text-primary w-6 h-6" />
                      <div>
                        <h4 className="font-bold text-on-surface">Gemma 4</h4>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-secondary opacity-60">On-Device Intelligence</p>
                      </div>
                    </div>
                    <div className="flex bg-surface-container-low p-1 rounded-lg">
                      {(['2b', '4b'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => setGemmaSize(size)}
                          className={cn(
                            "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                            gemmaSize === size 
                              ? "bg-primary text-white shadow-sm" 
                              : "text-secondary hover:text-on-surface"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <p className="text-xs leading-relaxed text-secondary">
                    Download the latest Gemma 4 model to chat even when you're deep in the desert. The 4b model is smarter but requires more space and RAM.
                  </p>

                  <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-[10px] leading-relaxed text-primary font-medium">
                      <strong>Tip:</strong> On iPhone, use "Add to Home Screen" to ensure the model isn't deleted by the system to save space.
                    </p>
                  </div>

                  {gemmaStatus === 'not_downloaded' && (
                    <button 
                      onClick={handleDownloadGemma}
                      className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-md hover:opacity-90 transition-all"
                    >
                      Download Offline Guide
                    </button>
                  )}

                  {gemmaStatus === 'downloading' && (
                    <div className="space-y-2">
                      <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-center font-bold text-primary uppercase tracking-widest animate-pulse">
                        Downloading... {downloadProgress}%
                      </p>
                    </div>
                  )}

                  {gemmaStatus === 'downloaded' && (
                    <div className="flex items-center justify-center gap-2 text-primary bg-primary/10 py-3 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-bold">Offline Guide Ready</span>
                    </div>
                  )}

                  {gemmaStatus === 'error' && (
                    <div className="space-y-3">
                      <p className="text-xs text-error text-center font-medium">{gemmaError || "Download failed. Check space or connection."}</p>
                      <button 
                        onClick={handleDownloadGemma}
                        className="w-full py-3 bg-surface-container-low text-on-surface rounded-xl font-bold text-sm border border-error/20"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderFunFacts = () => (
    <div className="space-y-12">
      <div className="mb-12">
        <p className="font-label text-primary tracking-widest uppercase text-xs mb-2">Group Statistics</p>
        <h2 className="font-headline text-4xl font-bold tracking-tight text-on-surface leading-tight">
          Our Journey in <span className="italic text-primary">Numbers</span>
        </h2>
      </div>

      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-6 bg-surface-container-low rounded-xl p-8 relative overflow-hidden flex flex-col justify-between min-h-[200px]">
          <div className="relative z-10">
            <Sparkles className="text-primary w-10 h-10 mb-4" />
            <h3 className="font-label text-on-surface-variant uppercase tracking-[0.2em] text-[10px]">Group Contribution</h3>
            <p className="font-headline text-6xl font-bold text-on-surface mt-2">{stats.uniqueContributors}</p>
            <p className="font-body text-secondary font-medium tracking-wide">Active Planners</p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
        </div>

        <div className="col-span-3 bg-surface-container-highest rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-label text-on-surface-variant uppercase tracking-widest text-[10px]">Total Adventures</h3>
            <p className="font-headline text-4xl font-bold text-primary mt-1">{stats.totalActivities}</p>
          </div>
          <p className="font-body text-xs text-secondary mt-4 leading-relaxed">
            {stats.scheduledActivities} activities have been scheduled on the calendar.
          </p>
        </div>

        <div className="col-span-3 bg-white rounded-xl p-6 custom-shadow flex flex-col justify-between">
          <div>
            <h3 className="font-label text-on-surface-variant uppercase tracking-widest text-[10px]">Packing Progress</h3>
            <p className="font-headline text-4xl font-bold text-on-surface mt-1">{stats.completionRate}%</p>
          </div>
          <div className="w-full bg-surface-container-highest h-1.5 rounded-full mt-4 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${stats.completionRate}%` }}
              className="h-full bg-primary"
            />
          </div>
        </div>

        <div className="col-span-6 mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="font-headline text-xl font-semibold">Vibe Check</h4>
            <span className="font-label text-[10px] uppercase tracking-widest text-primary">Most Popular: {stats.topVibe}</span>
          </div>
          
          <div className="space-y-4">
            {['Nature', 'City', 'Adventure', 'Relaxed'].map((vibe) => {
              const count = activities.filter(a => a.vibe === vibe).length;
              const percentage = activities.length > 0 ? (count / activities.length) * 100 : 0;
              
              return (
                <div key={vibe} className="flex items-center gap-4">
                  <span className="w-20 text-xs font-bold text-secondary uppercase tracking-widest">{vibe}</span>
                  <div className="flex-1 bg-surface-container-low h-8 rounded-lg overflow-hidden relative">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className={cn(
                        "h-full transition-all",
                        vibe === stats.topVibe ? "bg-primary" : "bg-primary/20"
                      )}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-bold text-on-surface-variant">
                      {count} {count === 1 ? 'Activity' : 'Activities'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const handleGoogleSignIn = async () => {
    try {
      setLoginError(null);
      
      // On mobile, popups are often blocked, but redirects have storage issues.
      // We'll try popup first, but if it fails, we'll give a clearer message.
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError("This domain is not authorized. Please add your Cloud Run URL to the Firebase Console 'Authorized Domains' list.");
      } else if (error.message?.includes('missing initial state')) {
        setLoginError("Mobile browser restriction detected. Please try: 1) Opening this link in Safari/Chrome directly (not inside an app like Slack/Discord) or 2) Using the 'Redirect Sign-in' button below.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("Sign-in popup was blocked. Please allow popups for this site or use 'Redirect Sign-in' below.");
      } else {
        setLoginError("Failed to sign in. Please try again.");
      }
    }
  };

  if (!isUnlocked) {
    return (
      <ErrorBoundary>
        {renderPasscodeScreen()}
      </ErrorBoundary>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-pulse text-primary font-bold">Loading Pathfinder...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <h1 className="serif-text text-4xl font-bold mb-4">Pathfinder</h1>
          <p className="text-secondary mb-8 max-w-xs">
            Join your group to start planning your sun-drenched memories together.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button 
              onClick={handleGoogleSignIn}
              className="bg-primary text-white px-8 py-4 rounded-full font-bold flex items-center justify-center gap-3 shadow-lg hover:scale-105 transition-transform"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>
          </div>
          {loginError && (
            <p className="mt-4 text-error text-xs font-bold bg-error/10 p-3 rounded-lg max-w-xs">
              {loginError}
            </p>
          )}
          
          <button 
            onClick={() => signInWithGoogleRedirect()}
            className="mt-6 text-[10px] font-bold text-outline-variant uppercase tracking-widest hover:text-primary transition-colors"
          >
            Having trouble? Try Redirect Sign-in
          </button>
          <p className="mt-2 text-[9px] text-outline-variant max-w-[200px] mx-auto opacity-60">
            Note: Redirect sign-in may fail in some browsers when viewed inside an iframe. If it fails, please use the popup button or open the app in a new tab.
          </p>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface pb-32">
      <Header onMenuClick={() => {}} userPhoto={user?.photoURL} />
      
      <main className="pt-24 px-6 max-w-2xl mx-auto h-full">
        <AnimatePresence mode="wait">
          {isAdding ? (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button 
                onClick={() => {
                  setIsAdding(false);
                  setEditingActivity(null);
                }}
                className="mb-6 flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Journal
              </button>
              {renderAddForm()}
            </motion.div>
          ) : isPicking ? (
            <motion.div 
              key="pick-activity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderPickActivity()}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'home' && renderHome()}
              {activeTab === 'must-do' && renderActivityList('must-do')}
              {activeTab === 'nice-to-do' && renderActivityList('nice-to-do')}
              {activeTab === 'ask-me' && renderAskMe()}
              {activeTab === 'fun-facts' && renderFunFacts()}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {!isAdding && !isPicking && (
        <>
          <Navigation activeTab={activeTab} onTabChange={(tab) => {
            setActiveTab(tab);
            setIsAdding(false);
            setIsPicking(false);
          }} />
          
          {(activeTab === 'must-do' || activeTab === 'nice-to-do') && (
            <button 
              onClick={() => setIsAdding(true)}
              className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-50"
            >
              <Plus className="w-6 h-6" />
            </button>
          )}
        </>
      )}
      </div>
    </ErrorBoundary>
  );
}
