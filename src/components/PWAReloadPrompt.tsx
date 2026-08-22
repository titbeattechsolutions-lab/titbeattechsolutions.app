// @ts-nocheck
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export function PWAReloadPrompt() {
  const { toast } = useToast();
  
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Setup periodic update checks (every hour)
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg p-4 max-w-sm flex flex-col gap-3 relative">
        <button 
          onClick={close}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div>
          <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {needRefresh ? "App Update Available" : "App Ready Offline"}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {needRefresh 
              ? "A new version of SchoolHub is available. Reload to apply the update." 
              : "The app has been downloaded and is ready to work offline."}
          </p>
        </div>

        {needRefresh && (
          <Button 
            size="sm" 
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => updateServiceWorker(true)}
          >
            <RefreshCw className="w-4 h-4" />
            Reload & Update
          </Button>
        )}
      </div>
    </div>
  );
}

