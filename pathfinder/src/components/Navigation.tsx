import React from 'react';
import { Home, Compass, Heart, MessageSquare, Lightbulb } from 'lucide-react';
import { Tab } from '../types';
import { cn } from '../lib/utils';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'home' as Tab, label: 'Home', icon: Home },
    { id: 'must-do' as Tab, label: 'Must Do', icon: Compass },
    { id: 'nice-to-do' as Tab, label: 'Nice to Do', icon: Heart },
    { id: 'ask-me' as Tab, label: 'Ask Me', icon: MessageSquare },
    { id: 'fun-facts' as Tab, label: 'Fun Facts', icon: Lightbulb },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-surface/90 backdrop-blur-2xl nav-shadow rounded-t-[1.5rem]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center transition-all duration-300 active:scale-90",
              isActive 
                ? "bg-primary text-white rounded-[1.5rem] rounded-tr-none px-4 py-2" 
                : "text-secondary opacity-70 hover:text-primary"
            )}
          >
            <Icon className={cn("w-6 h-6", isActive && "fill-current")} />
            <span className="font-label text-[10px] uppercase tracking-widest font-semibold mt-1">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
