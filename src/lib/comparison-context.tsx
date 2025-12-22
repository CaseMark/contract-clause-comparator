'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface ActiveComparison {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: string;
}

interface ComparisonContextType {
  activeComparison: ActiveComparison | null;
  setActiveComparison: (comparison: ActiveComparison | null) => void;
  isComparisonInProgress: boolean;
  clearActiveComparison: () => void;
  pollComparisonStatus: (comparisonId: string) => Promise<void>;
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(undefined);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [activeComparison, setActiveComparisonState] = useState<ActiveComparison | null>(null);

  // Load active comparison from localStorage on mount and verify it still exists
  useEffect(() => {
    const stored = localStorage.getItem('activeComparison');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Only restore if it's still in progress
        if (parsed.status === 'pending' || parsed.status === 'processing') {
          // Verify the comparison still exists in the database
          fetch(`/api/compare/${parsed.id}/status`)
            .then(response => {
              if (response.ok) {
                return response.json();
              }
              // Comparison doesn't exist anymore - clear it
              localStorage.removeItem('activeComparison');
              return null;
            })
            .then(data => {
              if (data) {
                if (data.status === 'completed' || data.status === 'failed') {
                  // Comparison finished - clear it
                  localStorage.removeItem('activeComparison');
                } else {
                  // Comparison still in progress - restore it
                  setActiveComparisonState({
                    ...parsed,
                    status: data.status,
                  });
                }
              }
            })
            .catch(() => {
              // Error fetching - clear the stale state
              localStorage.removeItem('activeComparison');
            });
        } else {
          localStorage.removeItem('activeComparison');
        }
      } catch {
        localStorage.removeItem('activeComparison');
      }
    }
  }, []);

  const setActiveComparison = useCallback((comparison: ActiveComparison | null) => {
    setActiveComparisonState(comparison);
    if (comparison) {
      localStorage.setItem('activeComparison', JSON.stringify(comparison));
    } else {
      localStorage.removeItem('activeComparison');
    }
  }, []);

  const clearActiveComparison = useCallback(() => {
    setActiveComparisonState(null);
    localStorage.removeItem('activeComparison');
  }, []);

  const pollComparisonStatus = useCallback(async (comparisonId: string) => {
    try {
      const response = await fetch(`/api/compare/${comparisonId}/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' || data.status === 'failed') {
          clearActiveComparison();
        } else if (activeComparison) {
          setActiveComparison({
            ...activeComparison,
            status: data.status,
          });
        }
      } else if (response.status === 404) {
        // Comparison was deleted - clear the active state
        clearActiveComparison();
      }
    } catch (error) {
      console.error('Error polling comparison status:', error);
    }
  }, [activeComparison, setActiveComparison, clearActiveComparison]);

  // Use SSE for real-time status updates when there's an active comparison
  useEffect(() => {
    if (!activeComparison || activeComparison.status === 'completed' || activeComparison.status === 'failed') {
      return;
    }

    // Connect to SSE stream for this specific comparison
    const eventSource = new EventSource(`/api/compare/stream?ids=${activeComparison.id}`);
    
    eventSource.addEventListener('status', (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.id === activeComparison.id) {
          if (update.status === 'completed' || update.status === 'failed') {
            clearActiveComparison();
            eventSource.close();
          } else {
            setActiveComparison({
              ...activeComparison,
              status: update.status,
            });
          }
        }
      } catch (err) {
        console.error('Error parsing SSE status:', err);
      }
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
    });

    eventSource.addEventListener('error', () => {
      // On error, close and let the effect reconnect if needed
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [activeComparison?.id, activeComparison?.status, clearActiveComparison, setActiveComparison]);

  const isComparisonInProgress = activeComparison !== null && 
    (activeComparison.status === 'pending' || activeComparison.status === 'processing');

  return (
    <ComparisonContext.Provider
      value={{
        activeComparison,
        setActiveComparison,
        isComparisonInProgress,
        clearActiveComparison,
        pollComparisonStatus,
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const context = useContext(ComparisonContext);
  if (context === undefined) {
    throw new Error('useComparison must be used within a ComparisonProvider');
  }
  return context;
}
