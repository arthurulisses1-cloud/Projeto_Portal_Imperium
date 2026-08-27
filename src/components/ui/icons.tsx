type P = { className?: string };
const base = "w-4 h-4";
const props = (c?: string) => ({
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: c ?? base,
});

export const IconTemple = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M3 21h18M4 21V10M20 21V10M2 10l10-6 10 6M6 10v7M10 10v7M14 10v7M18 10v7" />
  </svg>
);
export const IconScroll = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M6 4h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 1H8a2 2 0 0 1-2-2V4Z" />
    <path d="M6 4a2 2 0 0 0-2 2v1h2M9 9h6M9 13h6" />
  </svg>
);
export const IconSwords = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 4l7 7M20 4l-7 7M4 20l6-6M20 20l-6-6M9 9l-1 6M15 9l1 6" />
  </svg>
);
export const IconShield = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
  </svg>
);
export const IconColumn = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 3h16M4 21h16M7 6v13M17 6v13M9 6v13M15 6v13" />
  </svg>
);
export const IconCoin = ({ className }: P) => (
  <svg {...props(className)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8.5v7M9.5 10a2.5 2 0 0 1 2.5-1.5c1.5 0 2.5.7 2.5 1.7 0 2.3-5 1-5 3.3 0 1 1 1.8 2.5 1.8s2.5-.7 2.5-1.7" />
  </svg>
);
export const IconLaurel = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M6 20c6 0 10-6 10-14M4 12c2 0 3-2 3-4M4 16c2.5 0 4-2 4-4M5 8c1.5 0 2.5-1.5 2.5-3" />
  </svg>
);
export const IconBook = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
  </svg>
);
export const IconEagle = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M12 3c1.5 2 4 3 8 3-2 2-4 3-4 6 0 4-2 8-4 9-2-1-4-5-4-9 0-3-2-4-4-6 4 0 6.5-1 8-3Z" />
    <path d="M12 12v9" />
  </svg>
);
export const IconScales = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M12 3v18M6 7h12M6 7l-3 6a3 3 0 0 0 6 0l-3-6ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM8 21h8" />
  </svg>
);
export const IconTarget = ({ className }: P) => (
  <svg {...props(className)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
);
export const IconHorn = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 5c6 0 12 4 16 9-5-1-9 1-11 4-2-4-3-9-5-13Z" />
  </svg>
);
export const IconTablet = ({ className }: P) => (
  <svg {...props(className)}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);
export const IconFlame = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M12 3c1 3-3 4-3 7.5a3.5 3.5 0 0 0 7 0c0-1.2-.6-2-1.2-2.8.3 2-1.1 2.8-1.8 2 .8-2.3-1-4-1-6.7Z" />
    <path d="M9 15a3.5 4 0 0 0 7 0" />
  </svg>
);
export const IconGift = ({ className }: P) => (
  <svg {...props(className)}>
    <rect x="4" y="9" width="16" height="4" />
    <rect x="5" y="13" width="14" height="8" />
    <path d="M12 9v12M12 9c-1-3-3.5-4-4.5-2.5S9 9 12 9ZM12 9c1-3 3.5-4 4.5-2.5S15 9 12 9Z" />
  </svg>
);
export const IconLock = ({ className }: P) => (
  <svg {...props(className)}>
    <rect x="5" y="11" width="14" height="10" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const IconBallot = ({ className }: P) => (
  <svg {...props(className)}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M8 12l2.5 2.5L16 9" />
  </svg>
);
export const IconMedal = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M8 3h8l-3 8h-2L8 3Z" />
    <circle cx="12" cy="15" r="6" />
    <path d="M12 12v6M9.5 15h5" />
  </svg>
);
export const IconCrown = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 9l3 3 5-6 5 6 3-3-2 10H6L4 9Z" />
    <path d="M6 19h12" />
  </svg>
);
export const IconTrophy = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5H4.5A2.5 2.5 0 0 0 7 9.5M17 5h2.5A2.5 2.5 0 0 1 17 9.5" />
    <path d="M12 14v3M9 20h6M9 17h6v3H9Z" />
  </svg>
);
export const IconCheck = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M4 12.5l5 5L20 6" />
  </svg>
);
export const IconEye = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconBell = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 3H4l2-3Z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);
export const IconAlert = ({ className }: P) => (
  <svg {...props(className)}>
    <path d="M12 3.5L21.5 20h-19L12 3.5Z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.3" r="0.6" fill="currentColor" />
  </svg>
);
