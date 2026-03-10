import React from 'react';
import { useSubscription } from '../context/SubscriptionContext';
import { PLAN_DETAILS } from '../constants';
import { PlanType } from '../types';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose }) => {
  const { subscription, upgradePlan } = useSubscription();

  if (!isOpen) return null;

  const handleUpgrade = (planId: PlanType) => {
    upgradePlan(planId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Upgrade Your Plan</h2>
              <p className="text-slate-400">Unlock premium features and remove limits.</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.values(PLAN_DETAILS).map((plan: any) => {
              const isCurrent = subscription.planId === plan.id;
              const isFree = plan.id === 'free';
              const isPopular = plan.id === 'monthly';
              const isBestValue = plan.id === 'yearly';

              return (
                <div 
                  key={plan.id}
                  className={`relative flex flex-col p-6 rounded-xl border-2 transition-all duration-300 ${
                    isCurrent 
                      ? 'border-indigo-500 bg-indigo-500/10' 
                      : isPopular 
                        ? 'border-purple-500 bg-slate-800 hover:border-purple-400' 
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      MOST POPULAR
                    </div>
                  )}
                  {isBestValue && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      BEST VALUE
                    </div>
                  )}

                  <div className="mb-6 text-center">
                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-3xl font-bold text-white">
                        {plan.currency}{plan.price}
                      </span>
                      {!isFree && <span className="text-slate-400">/{plan.id === 'yearly' ? 'year' : 'month'}</span>}
                    </div>
                    {plan.id === 'yearly' && (
                      <p className="text-green-400 text-xs font-bold mt-2">Save 35%</p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                        <svg className={`w-5 h-5 flex-shrink-0 ${isFree ? 'text-slate-500' : 'text-indigo-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => !isCurrent && handleUpgrade(plan.id)}
                    disabled={isCurrent}
                    className={`w-full py-3 px-4 rounded-lg font-bold transition-all ${
                      isCurrent
                        ? 'bg-slate-700 text-slate-400 cursor-default'
                        : isPopular || isBestValue
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white shadow-lg shadow-indigo-500/25'
                          : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : `Upgrade to ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          
          <p className="text-center text-xs text-slate-500 mt-8">
            Secure payment processing. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
