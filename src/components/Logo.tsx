export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
      <path d="M9 23V13.5L16 9l7 4.5V23" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M13.5 23v-5h5v5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Township</span>
    </div>
  );
}
