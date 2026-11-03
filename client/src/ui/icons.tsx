import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function ShipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 15.5 5.6 21h12.8L20 15.5" />
      <path d="M6.5 15.5V11h11v4.5" />
      <path d="M9 11V7h6v4" />
      <path d="M12 7V4" />
      <path d="M2.5 15.5h19" />
    </svg>
  );
}

export function TrainIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="3" width="16" height="13" rx="3" />
      <path d="M4 9h16" />
      <path d="M8 20l2-4M16 20l-2-4" />
      <circle cx="8.5" cy="12.5" r="1" />
      <circle cx="15.5" cy="12.5" r="1" />
    </svg>
  );
}

export function CraneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 21V7h14v14" />
      <path d="M3 7h18" />
      <path d="M12 7v5" />
      <rect x="10" y="12" width="4" height="2.6" rx="0.6" />
      <path d="M6.5 21v-3M17.5 21v-3" />
    </svg>
  );
}

export function ContainerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="7" width="18" height="11" rx="1.5" />
      <path d="M7 7v11M11 7v11M15 7v11" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7h10v9H3z" />
      <path d="M13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.7" />
      <circle cx="17" cy="18" r="1.7" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5" />
      <path d="M12 17.2v.1" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 14 3.5-4.5" />
      <circle cx="12" cy="15" r="1.3" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function LogoMark(props: IconProps) {
  return (
    <svg
      width={props.size ?? 34}
      height={props.size ?? 34}
      viewBox="0 0 40 40"
      fill="none"
      {...props}
    >
      <path
        d="M20 4 35 12v16L20 36 5 28V12L20 4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.8"
      />
      <path
        d="M20 10.5 29.5 15.5v9L20 29.5 10.5 24.5v-9L20 10.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.45"
      />
      <path d="M20 4v6.5M20 29.5V36M5 12l5.5 3.5M29.5 24.5 35 28" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="20" cy="20" r="3.2" fill="currentColor" opacity="0.9" />
    </svg>
  );
}
