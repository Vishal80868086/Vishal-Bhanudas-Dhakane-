import React, { createContext, useContext, useState, useEffect } from 'react';
import { PlanType, UserSubscription, SubscriptionPlan } from '../types';
import { PLAN_DETAILS } from '../constants';

interface SubscriptionContextType {
  subscription: UserSubscription;
  currentPlan: SubscriptionPlan;
  upgradePlan: (planId: PlanType) => void;
  incrementVideoUsage: () => void;
  canUploadVideo: () => boolean;
  checkFileSize: (sizeBytes: number) => boolean;
  resetUsage: () => void;
}

const DEFAULT_SUBSCRIPTION: UserSubscription = {
  planId: 'free',
  startDate: new Date().toISOString(),
  videosUsedThisMonth: 0,
  lastResetDate: new Date().toISOString(),
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<UserSubscription>(() => {
    const saved = localStorage.getItem('user_subscription');
    return saved ? JSON.parse(saved) : DEFAULT_SUBSCRIPTION;
  });

  useEffect(() => {
    localStorage.setItem('user_subscription', JSON.stringify(subscription));
  }, [subscription]);

  // Check for monthly reset
  useEffect(() => {
    const lastReset = new Date(subscription.lastResetDate);
    const now = new Date();
    
    // Simple check: if month changed since last reset
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      setSubscription(prev => ({
        ...prev,
        videosUsedThisMonth: 0,
        lastResetDate: now.toISOString()
      }));
    }
  }, []);

  const currentPlan = PLAN_DETAILS[subscription.planId];

  const upgradePlan = (planId: PlanType) => {
    setSubscription(prev => ({
      ...prev,
      planId,
      // Reset usage on upgrade? Or keep it? Let's keep it but limits change.
      // Actually, usually upgrades reset quotas or apply new quotas.
      // Let's keep usage count but new limit applies.
    }));
  };

  const incrementVideoUsage = () => {
    setSubscription(prev => ({
      ...prev,
      videosUsedThisMonth: prev.videosUsedThisMonth + 1
    }));
  };

  const canUploadVideo = () => {
    return subscription.videosUsedThisMonth < currentPlan.limits.maxVideosPerMonth;
  };

  const checkFileSize = (sizeBytes: number) => {
    const sizeMB = sizeBytes / (1024 * 1024);
    return sizeMB <= currentPlan.limits.maxFileSizeMB;
  };

  const resetUsage = () => {
    setSubscription(prev => ({
      ...prev,
      videosUsedThisMonth: 0
    }));
  };

  return (
    <SubscriptionContext.Provider value={{
      subscription,
      currentPlan,
      upgradePlan,
      incrementVideoUsage,
      canUploadVideo,
      checkFileSize,
      resetUsage
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
