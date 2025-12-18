'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CustomizationSettings {
  siteName: string | null;
  logoUrl: string | null;
}

interface CustomizationContextType {
  settings: CustomizationSettings;
  updateSiteName: (name: string | null) => void;
  updateLogo: (url: string | null) => void;
  resetSettings: () => void;
}

const defaultSettings: CustomizationSettings = {
  siteName: null,
  logoUrl: null,
};

const CustomizationContext = createContext<CustomizationContextType | undefined>(undefined);

const STORAGE_KEY = 'contract-comparator-customization';

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CustomizationSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      }
    } catch (error) {
      console.error('Failed to load customization settings:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        console.error('Failed to save customization settings:', error);
      }
    }
  }, [settings, isLoaded]);

  const updateSiteName = (name: string | null) => {
    setSettings(prev => ({ ...prev, siteName: name }));
  };

  const updateLogo = (url: string | null) => {
    setSettings(prev => ({ ...prev, logoUrl: url }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <CustomizationContext.Provider value={{ settings, updateSiteName, updateLogo, resetSettings }}>
      {children}
    </CustomizationContext.Provider>
  );
}

export function useCustomization() {
  const context = useContext(CustomizationContext);
  if (context === undefined) {
    throw new Error('useCustomization must be used within a CustomizationProvider');
  }
  return context;
}
