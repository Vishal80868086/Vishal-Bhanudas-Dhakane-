import React from 'react';

interface LogoProps {
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="url(#logo_gradient)" />
    <rect x="7" y="9" width="18" height="2.5" rx="1" fill="white" fillOpacity="0.95" />
    <rect x="7" y="15" width="14" height="2.5" rx="1" fill="white" fillOpacity="0.95" />
    <rect x="7" y="21" width="10" height="2.5" rx="1" fill="white" fillOpacity="0.95" />
    <path d="M25 18L26 20.5L28.5 21.5L26 22.5L25 25L24 22.5L21.5 21.5L24 20.5L25 18Z" fill="#fbbf24" />
    <defs>
      <linearGradient id="logo_gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#a855f7" />
      </linearGradient>
    </defs>
  </svg>
);

export default Logo;