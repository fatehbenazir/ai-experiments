import React from 'react';
import { Menu, LogOut } from 'lucide-react';
import { auth } from '../firebase';

interface HeaderProps {
  onMenuClick?: () => void;
  userPhoto?: string | null;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick, userPhoto }) => {
  return (
    <header className="fixed top-0 w-full z-50 flex items-center justify-between px-6 py-4 bg-surface/80 backdrop-blur-xl custom-shadow">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-primary hover:opacity-80 transition-opacity">
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-headline italic text-primary font-bold tracking-tight">Pathfinder</h1>
      </div>
      <div className="flex items-center gap-3">
        <button 
          onClick={() => auth.signOut()}
          className="p-2 text-secondary hover:text-primary transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest border-2 border-primary/10">
          <img 
            alt="User profile" 
            className="w-full h-full object-cover" 
            src={userPhoto || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150"}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </header>
  );
};
