import React, { ReactNode } from 'react';

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  variant?: "default" | "primary";
  disabled?: boolean;
}

export default function ActionButton({
  icon,
  label,
  href,
  onClick,
  active,
  variant = "default",
  disabled = false,
}: ActionButtonProps) {
  const isPrimary = variant === "primary";
  const content = (
    <>
      <span className={active || isPrimary ? "text-white" : "text-secondary"}>
        {icon}
      </span>
      <span className={isPrimary ? "text-white" : ""}>{label}</span>
    </>
  );

  const baseClasses = `flex items-center justify-center gap-2 py-3.5 border rounded-xl text-[12px] font-bold transition-all shadow-sm w-full`;
  const stateClasses = active
    ? "bg-secondary border-secondary text-white shadow-secondary/20 active:scale-95"
    : isPrimary
      ? "bg-blue-600 border-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700 active:scale-95"
      : "bg-white/40 border-white text-[#1e3a8a] hover:bg-white/80 active:scale-95";

  if (disabled) {
    return (
      <button disabled className={`${baseClasses} bg-white/20 border-white text-[#1e3a8a]/50 opacity-50 cursor-not-allowed`}>
        {content}
      </button>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${baseClasses} ${stateClasses}`} style={isPrimary ? { backgroundColor: "#2563eb", color: "#ffffff", borderColor: "#2563eb" } : {}}>
        {content}
      </button>
    );
  }

  return (
    <a
      href={href || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseClasses} ${stateClasses}`}
      style={isPrimary ? { backgroundColor: "#2563eb", color: "#ffffff", borderColor: "#2563eb", textDecoration: "none" } : {}}
    >
      {content}
    </a>
  );
}
