import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Sparkles } from "lucide-react";
import { api } from "@/services/api";
import type { Quiz } from "@/types";
import { format } from "@/lib/date";
import { TopBar } from "@/components/layout/top-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [active, setActive] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);

  const reload = async () => setQuizzes(await api.listQuizzes());

  useEffect(() => {
    void reload();
  }, []);

  const taken = (quizzes ?? []).filter((q) => q.best_score !== null);
  const average =
    taken.length === 0
      ? null
      : Math.round(
          (taken.reduce((s, q) => s + (q.best_score ?? 0) / Math.max(1, q.total), 0) / taken.length) *
            100,
        );

  return (
    <>
      <TopBar
        title="Quizzes"
        subtitle={
          quizzes
            ? `${quizzes.length} generated · ${taken.length} attempted${average !== null ? ` · ${average}% mean` : ""}`
            : "Loading quizzes"
        }
      />
      <div className="p-5 lg:p-6">
        {quizzes === null ? (
          <div className="skeleton h-40 rounded" />
        ) : quizzes.length === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title="No quizzes yet"
            description="Open a lesson and generate a quiz; every attempt is scored and kept here."
            action={
              <Link to="/planner">
                <Button variant="secondary" size="sm">
                  <Sparkles /> Pick a lesson
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="flex flex-col">
              {quizzes.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setActive(q);
                    setAnswers([]);
                    setScore(null);
                  }}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border-subtle px-2 py-2.5 text-left transition-colors",
                    active?.id === q.id ? "bg-surface-2" : "hover:bg-surface-2/50",
                  )}
                >
                  <span className="truncate text-[12px] text-text-primary">{q.title}</span>
                  <span className="flex items-center gap-2 text-[10px] text-text-muted">
                    <span className="numeric">{q.total}q</span>
                    <span>·</span>
                    <span>{format(new Date(q.created_at), "d MMM")}</span>
                    {q.best_score !== null ? (
                      <>
                        <span>·</span>
                        <span className="numeric text-accent">
                          best {q.best_score}/{q.total}
                        </span>
                      </>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>

            <div>
              {!active ? (
                <EmptyState icon={<ListChecks />} title="Pick a quiz to begin" />
              ) : (
                <div className="flex flex-col gap-3">
                  <h2 className="border-b border-border pb-3 text-[15px] text-text-primary">
                    {active.title}
                  </h2>
                  {active.questions.map((q, qi) => (
                    <Card key={qi} className="p-3.5">
                      <p className="text-[12.5px] leading-relaxed text-text-primary">
                        <span className="numeric mr-2 text-text-muted">{qi + 1}.</span>
                        {q.prompt}
                      </p>
                      <div className="mt-2.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {q.choices.map((c, ci) => {
                          const picked = answers[qi] === ci;
                          const correct = score !== null && ci === q.answer;
                          const wrong = score !== null && picked && ci !== q.answer;
                          return (
                            <button
                              key={ci}
                              onClick={() => {
                                if (score !== null) return;
                                const next = [...answers];
                                next[qi] = ci;
                                setAnswers(next);
                              }}
                              className={cn(
                                "flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
                                correct
                                  ? "border-success/60 bg-success-soft text-success"
                                  : wrong
                                    ? "border-danger/50 bg-danger-soft text-danger"
                                    : picked
                                      ? "border-accent/60 bg-accent-soft text-text-primary"
                                      : "border-border text-text-secondary hover:border-border-strong",
                              )}
                            >
                              <span className="numeric text-[10px] text-text-muted">
                                {String.fromCharCode(65 + ci)}
                              </span>
                              {c}
                            </button>
                          );
                        })}
                      </div>
                      {score !== null ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{q.why}</p>
                      ) : null}
                    </Card>
                  ))}

                  {score === null ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="self-start"
                      onClick={async () => {
                        const s = await api.submitQuiz(active.id, answers);
                        setScore(s);
                        toast(`Scored ${s}/${active.questions.length}.`, "success");
                        await reload();
                      }}
                    >
                      Submit answers
                    </Button>
                  ) : (
                    <p className="numeric text-[14px] text-accent">
                      {score}/{active.questions.length} correct
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
