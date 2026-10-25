import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import type { CompanionSkin } from "@/types";

/* Companion = a character with moods, driven by real progress.
   Skins share one expression vocabulary (eyes, mouth, blush) so every
   character reads the same emotion at a glance. */

export type CompanionState = "idle" | "focused" | "thinking" | "celebrating" | "encouraging";

const messages: Record<Exclude<CompanionState, "idle">, string[]> = {
  focused: [
    "Halfway there. Keep the tab open.",
    "One more and today is banked.",
    "You're in it — finish the row.",
  ],
  thinking: ["Let me think…", "Hmm, good question.", "Checking your notes…"],
  celebrating: ["Day cleared!", "That's a clean sweep.", "Streak preserved. Nicely done."],
  encouraging: [
    "Miss a day? No drama — pick two easy ones.",
    "Today still counts if you start now.",
    "Small steps count double after a break.",
  ],
};

const IDLE_LINES: Record<string, string[]> = {
  idle: ["Pick the next one — it's already queued.", "Short session still counts."],
  empty: ["Nothing scheduled. Add a playlist and I'll build the plan."],
};

/* ------------------------------- palette ------------------------------- */

type SkinColors = { fur: string; light: string; inner: string; eye: string; shadow: string };

const SKINS: Record<CompanionSkin, SkinColors> = {
  meep: {
    fur: "var(--gb-aqua)",
    light: "var(--gb-light0)",
    inner: "var(--accent)",
    eye: "var(--gb-dark0-hard)",
    shadow: "var(--accent)",
  },
  fox: {
    fur: "var(--gb-orange-faded)",
    light: "var(--gb-light0)",
    inner: "var(--gb-red-faded)",
    eye: "var(--gb-dark0-hard)",
    shadow: "var(--gb-orange-faded)",
  },
  cat: {
    fur: "var(--gb-light2)",
    light: "var(--gb-light0)",
    inner: "var(--gb-purple)",
    eye: "var(--gb-dark0-hard)",
    shadow: "var(--gb-purple)",
  },
  orb: {
    fur: "var(--gb-blue-faded)",
    light: "var(--gb-dark0-soft)",
    inner: "var(--gb-aqua)",
    eye: "var(--gb-green)",
    shadow: "var(--gb-aqua)",
  },
};

const SKIN_LABEL: Record<CompanionSkin, string> = {
  meep: "Meep",
  fox: "Fox",
  cat: "Cat",
  orb: "Terminal",
};

export const COMPANION_SKINS = SKIN_LABEL;

/* ------------------------------ expressions ---------------------------- */

function useBlink(interval = 3600) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (!alive) return;
      setClosed(true);
      timer = setTimeout(() => {
        setClosed(false);
        timer = setTimeout(loop, interval + Math.random() * 1800);
      }, 140);
    };
    timer = setTimeout(loop, 1600 + Math.random() * 2200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [interval]);
  return closed;
}

/** Two eyes that narrow with mood and blink on their own. */
function Eyes({
  y,
  gap = 13,
  color,
  mood,
  blink,
}: {
  y: number;
  gap?: number;
  color: string;
  mood: CompanionState;
  blink: boolean;
}) {
  if (mood === "celebrating") {
    // Happy arcs: the classic ^ ^
    return (
      <g stroke={color} strokeWidth={3.6} strokeLinecap="round" fill="none">
        <path d={`M ${60 - gap - 5} ${y + 1} q 5 -6 10 0`} />
        <path d={`M ${60 + gap - 5} ${y + 1} q 5 -6 10 0`} />
      </g>
    );
  }
  const close = mood === "focused" ? 0.55 : mood === "thinking" ? 0.72 : 1;
  const lift = mood === "thinking" ? -3 : 0;
  return (
    <g>
      {[60 - gap, 60 + gap].map((cx) => (
        <motion.rect
          key={cx}
          x={cx - 3.4}
          y={y - 8 + lift}
          width={6.8}
          height={16}
          rx={3.4}
          fill={color}
          animate={{ scaleY: blink ? 0.08 : close }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      ))}
    </g>
  );
}

function Mouth({ y, color, mood }: { y: number; color: string; mood: CompanionState }) {
  if (mood === "celebrating") {
    return <path d={`M 54 ${y} q 6 7 12 0`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />;
  }
  if (mood === "encouraging") {
    return <path d={`M 55 ${y} q 5 4 10 0`} stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" />;
  }
  const width = mood === "focused" ? 12 : 9;
  return (
    <rect
      x={60 - width / 2}
      y={y - 1}
      width={width}
      height={2.8}
      rx={1.4}
      fill={color}
      opacity={0.8}
    />
  );
}

/* -------------------------------- bodies -------------------------------- */

function Meep({ mood, skin, blink }: { mood: CompanionState; skin: SkinColors; blink: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id="meep-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gb-aqua)" />
          <stop offset="100%" stopColor="var(--gb-green-faded)" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="101" rx="26" ry="5" fill="var(--gb-dark0-hard)" opacity="0.45" />
      <rect x="22" y="22" width="76" height="74" rx="34" fill="url(#meep-fur)" />
      <rect
        x="22"
        y="22"
        width="76"
        height="74"
        rx="34"
        fill="none"
        stroke="var(--gb-light0)"
        strokeOpacity="0.22"
      />
      <ellipse cx="60" cy="80" rx="18" ry="11" fill={skin.light} opacity="0.16" />
      <Eyes y={54} color={skin.eye} mood={mood} blink={blink} />
      <Mouth y={72} color={skin.eye} mood={mood} />
      <circle cx="37" cy="65" r="4" fill="var(--gb-orange)" opacity={mood === "celebrating" ? 0.5 : 0.18} />
      <circle cx="83" cy="65" r="4" fill="var(--gb-orange)" opacity={mood === "celebrating" ? 0.5 : 0.18} />
    </>
  );
}

function Fox({ mood, skin, blink }: { mood: CompanionState; skin: SkinColors; blink: boolean }) {
  return (
    <>
      <ellipse cx="60" cy="101" rx="24" ry="5" fill="var(--gb-dark0-hard)" opacity="0.45" />
      <path d="M26 44 L28 10 L52 32 Z" fill={skin.fur} />
      <path d="M94 44 L92 10 L68 32 Z" fill={skin.fur} />
      <path d="M31 38 L32 19 L46 33 Z" fill={skin.inner} opacity="0.85" />
      <path d="M89 38 L88 19 L74 33 Z" fill={skin.inner} opacity="0.85" />
      <path
        d="M60 26 q34 0 34 34 q0 30 -34 34 q-34 -4 -34 -34 q0 -34 34 -34 Z"
        fill={skin.fur}
        stroke="var(--gb-light0)"
        strokeOpacity="0.16"
      />
      <path d="M60 96 q-24 -2 -28 -22 q14 8 28 8 q14 0 28 -8 q-4 20 -28 22 Z" fill={skin.light} opacity="0.9" />
      <Eyes y={56} gap={14} color={skin.eye} mood={mood} blink={blink} />
      <path d="M60 68 l5 4 -5 4 -5 -4 Z" fill={skin.eye} opacity="0.85" />
      <Mouth y={80} color={skin.eye} mood={mood} />
    </>
  );
}

function Cat({ mood, skin, blink }: { mood: CompanionState; skin: SkinColors; blink: boolean }) {
  return (
    <>
      <ellipse cx="60" cy="101" rx="23" ry="5" fill="var(--gb-dark0-hard)" opacity="0.45" />
      <path d="M28 42 L30 12 L54 30 Z" fill={skin.fur} />
      <path d="M92 42 L90 12 L66 30 Z" fill={skin.fur} />
      <path d="M33 37 L34 20 L47 31 Z" fill={skin.inner} opacity="0.75" />
      <path d="M87 37 L86 20 L73 31 Z" fill={skin.inner} opacity="0.75" />
      <circle cx="60" cy="60" r="35" fill={skin.fur} stroke="var(--gb-light0)" strokeOpacity="0.18" />
      <ellipse cx="60" cy="74" rx="19" ry="13" fill={skin.light} opacity="0.75" />
      <Eyes y={55} gap={14} color={skin.eye} mood={mood} blink={blink} />
      <path d="M57 68 h6 l-3 3 Z" fill="var(--gb-purple-deep)" opacity="0.9" />
      <Mouth y={76} color={skin.eye} mood={mood} />
      <g stroke={skin.eye} strokeWidth="1.4" opacity="0.4" strokeLinecap="round">
        <path d="M22 66 l-12 -3" />
        <path d="M22 71 l-13 2" />
        <path d="M98 66 l12 -3" />
        <path d="M98 71 l13 2" />
      </g>
    </>
  );
}

function Orb({ mood, skin, blink }: { mood: CompanionState; skin: SkinColors; blink: boolean }) {
  return (
    <>
      <defs>
        <radialGradient id="orb-glass" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="var(--gb-blue)" stopOpacity="0.9" />
          <stop offset="65%" stopColor="var(--gb-blue-faded)" />
          <stop offset="100%" stopColor="var(--gb-dark0)" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="102" rx="22" ry="5" fill="var(--gb-dark0-hard)" opacity="0.5" />
      <circle cx="60" cy="58" r="38" fill="var(--gb-dark2)" />
      <circle cx="60" cy="58" r="33" fill="url(#orb-glass)" />
      <circle
        cx="60"
        cy="58"
        r="33"
        fill="none"
        stroke={skin.shadow}
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />
      <ellipse cx="60" cy="58" rx="16" ry="22" fill="var(--gb-dark0-hard)" opacity="0.32" />
      <Eyes y={56} gap={9} color={skin.eye} mood={mood} blink={blink} />
      <Mouth y={74} color={skin.eye} mood={mood} />
      <g opacity="0.18" fill="var(--gb-light0)">
        {[40, 46, 52, 58, 64, 70, 76].map((y) => (
          <rect key={y} x="30" y={y} width="60" height="1.2" />
        ))}
      </g>
      <ellipse cx="46" cy="38" rx="9" ry="5" fill="var(--gb-light0)" opacity="0.28" transform="rotate(-28 46 38)" />
      <circle cx="60" cy="58" r="38" fill="none" stroke="var(--gb-dark3)" strokeWidth="2" />
    </>
  );
}

/* ------------------------------- assembly ------------------------------- */

export function Character({
  mood = "idle",
  skin = "meep",
  size = 64,
  name = "companion",
}: {
  mood?: CompanionState;
  skin?: CompanionSkin;
  size?: number;
  name?: string;
}) {
  const colors = SKINS[skin] ?? SKINS.meep;
  const blink = useBlink();

  return (
    <motion.div
      style={{ width: size, height: size }}
      className="relative shrink-0"
      animate={
        mood === "celebrating"
          ? { y: [0, -6, 0], rotate: [0, -3, 3, 0] }
          : mood === "thinking"
            ? { y: [0, -2, 0], rotate: [0, 2, 0] }
            : { y: [0, -2.4, 0] }
      }
      transition={{
        repeat: Infinity,
        duration: mood === "celebrating" ? 0.85 : mood === "focused" ? 2.2 : 3.6,
        ease: "easeInOut",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={name}>
        {skin === "fox" ? (
          <Fox mood={mood} skin={colors} blink={blink} />
        ) : skin === "cat" ? (
          <Cat mood={mood} skin={colors} blink={blink} />
        ) : skin === "orb" ? (
          <Orb mood={mood} skin={colors} blink={blink} />
        ) : (
          <Meep mood={mood} skin={colors} blink={blink} />
        )}
      </svg>
      {mood === "celebrating" ? (
        <motion.span
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.7, 1.35, 1.5] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.5 }}
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--accent) 45%, transparent), transparent 62%)",
            borderRadius: "9999px",
          }}
        />
      ) : null}
    </motion.div>
  );
}

/** Character + one line of speech. Used in cards and tooltips. */
export function Companion({
  state,
  message,
  onDismiss,
  stacked,
  size = 60,
  skin,
  name,
}: {
  state: CompanionState;
  message?: string;
  onDismiss?: () => void;
  /** Character above the bubble, centred — for dedicated panels. */
  stacked?: boolean;
  size?: number;
  skin?: CompanionSkin;
  name?: string;
}) {
  const [shown, setShown] = useState<string | null>(message ?? null);
  useEffect(() => setShown(message ?? null), [message]);

  const auto =
    shown ?? (state === "idle" ? pick(IDLE_LINES.idle ?? []) : pick(messages[state] ?? []));
  return (
    <div className={stacked ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-3"}>
      <Character mood={state} skin={skin} size={size} name={name} />
      <AnimatePresence mode="wait">
        {auto ? (
          <motion.div
            key={auto}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={
              stacked
                ? "max-w-[30ch] rounded-md border border-border bg-surface-2/70 px-3.5 py-2 text-[11.5px] leading-relaxed text-text-secondary backdrop-blur"
                : "max-w-45 rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-text-secondary"
            }
          >
            {auto}
            {onDismiss ? (
              <button
                onClick={onDismiss}
                className="ml-2 text-text-muted underline-offset-2 hover:underline"
              >
                ok
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? "";
}
