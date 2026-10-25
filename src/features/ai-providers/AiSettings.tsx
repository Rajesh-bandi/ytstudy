import { useEffect, useState } from "react";
import { Check, CircleAlert, Loader2, Plug, Save, Sparkles } from "lucide-react";
import { api, isDesktop } from "@/services/api";
import type { AiConfig } from "@/types";
import { DEFAULT_AI_CONFIG } from "@/types";
import { TopBar } from "@/components/layout/top-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Gateways people actually use. OmniRoute is the documented default;
 *  everything else is plain OpenAI-compatible so one client serves all. */
const PRESETS: { id: string; name: string; base: string; model: string; note: string }[] = [
  {
    id: "omniroute",
    name: "OmniRoute",
    base: "https://api.omniroute.ai/v1",
    model: "gpt-4o-mini",
    note: "Gateway that fronts many providers with one key.",
  },
  {
    id: "openai",
    name: "OpenAI",
    base: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "Direct OpenAI key.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-3.5-sonnet",
    note: "One key, many models.",
  },
  {
    id: "groq",
    name: "Groq",
    base: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    note: "Very fast inference.",
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    base: "http://localhost:11434/v1",
    model: "llama3.1",
    note: "Runs on this machine; leave the key blank.",
  },
];

export default function AiSettings() {
  const [cfg, setCfg] = useState<AiConfig>({ ...DEFAULT_AI_CONFIG });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.getAiConfig().then((c) => setCfg({ ...DEFAULT_AI_CONFIG, ...c }));
  }, []);

  const patch = (p: Partial<AiConfig>) => {
    setCfg((c) => ({ ...c, ...p }));
    setSaved(false);
    setResult(null);
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const reply = await api.testAiConnection(cfg);
      setResult({ ok: true, text: `Reachable — the model replied "${reply}".` });
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    try {
      await api.setAiConfig(cfg);
      setSaved(true);
      toast(cfg.enabled ? "AI settings saved." : "AI is off; saved anyway.", "success");
    } catch (e) {
      setResult({ ok: false, text: `Could not save: ${e}` });
      toast(`Could not save AI settings: ${e}`, "error");
    }
  };

  return (
    <>
      <TopBar title="AI provider" subtitle="One OpenAI-compatible gateway powers notes, quizzes, cards and the companion" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 lg:p-6">
        {!isDesktop ? (
          <div className="flex items-start gap-2.5 rounded-[3px] border border-warning/45 bg-warning-soft px-3 py-2.5">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <div className="text-[11px] leading-relaxed text-text-secondary">
              <span className="font-medium text-text-primary">Browser preview.</span> This tab runs on
              demo data: answers, notes and imports here are simulated and never call your gateway.
              Open the YTStudy desktop window to use your provider for real.
            </div>
          </div>
        ) : null}

        {/* Provider choice */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => {
            const active = cfg.base_url.replace(/\/$/, "") === p.base.replace(/\/$/, "");
            return (
              <button
                key={p.id}
                onClick={() => patch({ base_url: p.base, model: p.model })}
                className={cn(
                  "flex flex-col gap-1 rounded-[3px] border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-accent/60 bg-accent-soft"
                    : "border-border hover:border-border-strong hover:bg-surface-2/60",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-[12px] text-text-primary">
                  {p.name}
                  {active ? <Check className="size-3 text-accent" /> : null}
                </span>
                <span className="text-[10px] leading-snug text-text-muted">{p.note}</span>
              </button>
            );
          })}
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3.5">
            <Field label="Gateway base URL" hint="Must expose POST /chat/completions">
              <Input
                value={cfg.base_url}
                onChange={(e) => patch({ base_url: e.target.value })}
                placeholder="https://api.omniroute.ai/v1"
                spellCheck={false}
                className="font-mono text-[12px]"
              />
            </Field>

            <Field label="Model" hint="Whatever the gateway names it">
              <Input
                value={cfg.model}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder="gpt-4o-mini"
                spellCheck={false}
                className="font-mono text-[12px]"
              />
            </Field>

            <Field
              label="API key"
              hint="Stored in the local SQLite file only — never in the frontend bundle"
            >
              <Input
                type="password"
                value={cfg.api_key}
                onChange={(e) => patch({ api_key: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[12px]"
              />
            </Field>

            <div className="flex items-center justify-between gap-4 rounded-[3px] border border-border-subtle bg-surface-2/40 px-3 py-2.5">
              <div>
                <p className="text-[12px] text-text-primary">Enable AI features</p>
                <p className="text-[10.5px] text-text-muted">
                  Notes, quizzes, cards and companion chat. The planner keeps working when this is off.
                </p>
              </div>
              <Switch
                ariaLabel="Enable AI features"
                checked={cfg.enabled}
                onCheckedChange={(v) => patch({ enabled: v })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void test()} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : <Plug />} Test connection
              </Button>
              <Button variant="primary" size="sm" onClick={() => void save()}>
                {saved ? <Check /> : <Save />} {saved ? "Saved" : "Save settings"}
              </Button>
              <span className="ml-auto flex items-center gap-1.5 text-[10.5px] text-text-muted">
                <Sparkles className="size-3" aria-hidden />
                {cfg.enabled && cfg.api_key.trim() ? "ready" : "inactive"}
              </span>
            </div>

            {result ? (
              <p
                className={cn(
                  "flex items-start gap-2 rounded-[3px] border px-2.5 py-2 text-[11px] leading-relaxed",
                  result.ok
                    ? "border-success/40 bg-success-soft text-success"
                    : "border-danger/40 bg-danger-soft text-danger",
                )}
              >
                {result.ok ? (
                  <Check className="mt-0.5 size-3 shrink-0" />
                ) : (
                  <CircleAlert className="mt-0.5 size-3 shrink-0" />
                )}
                {result.text}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">What the AI may read</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[11.5px] leading-relaxed text-text-secondary">
            <li>· The lesson title, playlist and its public video description / chapters.</li>
            <li>· Your notes for that lesson, when generating a quiz or cards.</li>
            <li>· Your streak, daily counts and playlist targets, for companion answers.</li>
          </ul>
          <p className="mt-2 text-[10.5px] text-text-muted">
            Nothing is sent until you press a generate action or ask the companion a question.
          </p>
        </Card>
      </div>
    </>
  );
}
