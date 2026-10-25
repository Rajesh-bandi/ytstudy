import { useEffect, useMemo, useState } from "react";
import { Layers, ListChecks, NotebookPen, RotateCcw, Save, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import type { AppSettings, PromptDefaults } from "@/types";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PromptField = "note_prompt" | "quiz_prompt" | "flashcard_prompt";
type Draft = Record<PromptField, string>;

const SECTIONS: {
  field: PromptField;
  defaultKey: keyof PromptDefaults;
  index: string;
  title: string;
  job: string;
  icon: typeof NotebookPen;
  description: string;
  appended: boolean;
}[] = [
  {
    field: "note_prompt",
    defaultKey: "note",
    index: "01",
    title: "Notes",
    job: "generate_note",
    icon: NotebookPen,
    description:
      "Sets structure, depth and tone. Ask for a different outline or extra examples; the lesson transcript is still supplied as the source.",
    appended: false,
  },
  {
    field: "quiz_prompt",
    defaultKey: "quiz",
    index: "02",
    title: "Quizzes",
    job: "generate_quiz",
    icon: ListChecks,
    description:
      "Sets emphasis, difficulty and how distractors are written. The four-choice JSON schema is appended automatically, so keep the prose free of format rules.",
    appended: true,
  },
  {
    field: "flashcard_prompt",
    defaultKey: "flashcard",
    index: "03",
    title: "Flashcards",
    job: "generate_flashcards",
    icon: Layers,
    description:
      "Sets what a card should capture and how tightly it is phrased. Card count and the JSON schema are handled for you.",
    appended: true,
  },
];

function normalize(s: AppSettings, d: PromptDefaults): Draft {
  return {
    note_prompt: s.note_prompt.trim() ? s.note_prompt : d.note,
    quiz_prompt: s.quiz_prompt.trim() ? s.quiz_prompt : d.quiz,
    flashcard_prompt: s.flashcard_prompt.trim() ? s.flashcard_prompt : d.flashcard,
  };
}

export default function Prompts() {
  const [defaults, setDefaults] = useState<PromptDefaults | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getSettings(), api.getPromptDefaults()]).then(([settings, shipped]) => {
      if (!alive) return;
      const next = normalize(settings, shipped);
      setDefaults(shipped);
      setDraft(next);
      setBaseline(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dirty = useMemo(
    () => (draft && baseline ? SECTIONS.filter((s) => draft[s.field] !== baseline[s.field]) : []),
    [draft, baseline],
  );
  const blank = draft ? SECTIONS.some((s) => !draft[s.field].trim()) : false;

  const resetField = (section: (typeof SECTIONS)[number]) => {
    if (!defaults) return;
    setDraft((d) => (d ? { ...d, [section.field]: defaults[section.defaultKey] } : d));
  };

  const discard = () => {
    if (baseline) setDraft(baseline);
  };

  const save = async () => {
    if (!draft || !defaults) return;
    setSaving(true);
    try {
      const saved = await api.setSettings(draft);
      const next = normalize(saved, defaults);
      setDraft(next);
      setBaseline(next);
      toast("Prompts saved. The next generation uses them.", "success");
    } catch (e) {
      toast(`Could not save prompts: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar
        title="Generation prompts"
        subtitle="What the companion is told to write — notes, quizzes and cards"
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <p className="max-w-xl text-[12px] leading-relaxed text-text-secondary">
            Each generator sends one instruction to the model, then the lesson material. Rewrite it
            to change how notes are organised, how hard quizzes get, or what a flashcard should
            capture. Reset restores the shipped text for that field alone.
          </p>
          <Link
            to="/settings/ai"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-accent"
          >
            AI provider →
          </Link>
        </div>

        {!draft || !defaults ? (
          <div className="skeleton h-64 rounded-lg" />
        ) : (
          SECTIONS.map((section) => {
            const Icon = section.icon;
            const value = draft[section.field];
            const shipped = defaults[section.defaultKey];
            const isEdited = value !== shipped;
            const isUnsaved = baseline !== null && value !== baseline[section.field];
            return (
              <Card key={section.field} className={cn(isUnsaved && "border-accent/35")}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="numeric pt-0.5 text-[10px] text-text-muted">
                      {section.index}
                    </span>
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.015em] text-text-primary">
                        <Icon className="size-3.5 text-accent" aria-hidden />
                        {section.title}
                      </h2>
                      <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
                        {section.job}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "font-mono text-[9.5px] uppercase tracking-[0.12em]",
                        isUnsaved ? "text-accent" : "text-text-muted",
                      )}
                    >
                      {isUnsaved ? "unsaved" : isEdited ? "custom" : "default"}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => resetField(section)}
                      disabled={!isEdited}
                      title={`Restore the shipped ${section.title.toLowerCase()} prompt`}
                    >
                      <RotateCcw /> Reset
                    </Button>
                  </div>
                </div>

                <div className="p-5">
                  <Textarea
                    aria-label={`${section.title} generation prompt`}
                    value={value}
                    spellCheck={false}
                    rows={section.field === "note_prompt" ? 9 : 5}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, [section.field]: e.target.value } : d))
                    }
                    className="min-h-0 resize-y font-mono text-[11.5px] leading-[1.7]"
                  />
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-lg text-[10.5px] leading-relaxed text-text-muted">
                      {section.description}
                      {section.appended ? (
                        <span className="text-text-muted/80"> Output format is appended.</span>
                      ) : null}
                    </p>
                    <span className="numeric shrink-0 text-[10px] text-text-muted">
                      {value.length.toLocaleString()} chars
                    </span>
                  </div>
                  {!value.trim() ? (
                    <p className="mt-2 border-l-2 border-danger pl-2 text-[10.5px] text-danger">
                      A prompt cannot be empty — reset it or write your own.
                    </p>
                  ) : null}
                </div>
              </Card>
            );
          })
        )}

        {draft ? (
          <Card className="mt-1">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-[12px] text-text-primary">
                  {dirty.length === 0
                    ? "No unsaved changes"
                    : `${dirty.length} of ${SECTIONS.length} prompts edited`}
                </p>
                <p className="mt-0.5 text-[10.5px] text-text-muted">
                  Applies to the next note, quiz or deck you generate. Existing artifacts are not
                  rewritten.
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={discard}
                  disabled={dirty.length === 0 || saving}
                >
                  <Undo2 /> Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void save()}
                  disabled={dirty.length === 0 || blank || saving}
                >
                  <Save /> {saving ? "Saving…" : "Save prompts"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
