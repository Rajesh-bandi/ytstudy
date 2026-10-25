import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { api } from "@/services/api";
import type { Flashcard } from "@/types";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Flashcards() {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [deck, setDeck] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const reload = async () => setCards(await api.listFlashcards());

  useEffect(() => {
    void reload();
  }, []);

  const decks = useMemo(() => {
    const map = new Map<string, Flashcard[]>();
    for (const c of cards ?? []) {
      const list = map.get(c.deck) ?? [];
      list.push(c);
      map.set(c.deck, list);
    }
    // Cards never reviewed float to the top of their deck.
    for (const [, list] of map) list.sort((a, b) => a.reviews - b.reviews);
    return [...map.entries()];
  }, [cards]);

  const activeDeck = decks.find(([name]) => name === deck) ?? decks[0];
  const deckSize = activeDeck?.[1].length ?? 0;
  const position = deckSize > 0 ? index % deckSize : 0;
  const activeCard = activeDeck?.[1][position];

  return (
    <>
      <TopBar
        title="Flashcards"
        subtitle={cards ? `${cards.length} cards · ${decks.length} decks` : "Loading cards"}
      />
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-6">
        <aside className="flex flex-col">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-text-muted">Decks</p>
          {decks.map(([name, list]) => (
            <button
              key={name}
              onClick={() => {
                setDeck(name);
                setIndex(0);
                setFlipped(false);
              }}
              className={cn(
                "flex items-center justify-between gap-2 border-b border-border-subtle px-1.5 py-2 text-left text-[11.5px] transition-colors",
                activeDeck?.[0] === name
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <span className="truncate">{name}</span>
              <span className="numeric text-[10px] text-text-muted">{list.length}</span>
            </button>
          ))}
        </aside>

        <div>
          {cards === null ? (
            <div className="skeleton h-56 rounded" />
          ) : !activeCard ? (
            <EmptyState
              icon={<Layers />}
              title="No cards yet"
              description="Open a lesson and generate flashcards; they arrive here as decks."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <button
                onClick={() => setFlipped((f) => !f)}
                className="flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-[4px] border border-border bg-surface p-8 text-center transition-colors hover:border-border-strong"
              >
                <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  {flipped ? "answer" : "question"}
                </span>
                <span className="max-w-[52ch] text-[15px] leading-relaxed text-text-primary">
                  {flipped ? activeCard.back : activeCard.front}
                </span>
                <span className="text-[10px] text-text-muted">
                  click to flip · reviewed {activeCard.reviews}×
                </span>
              </button>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="numeric text-[10.5px] text-text-muted">
                  {position + 1}/{deckSize}
                </span>
                <div className="flex gap-1.5">
                  {[
                    { key: "again", label: "Forgot" },
                    { key: "hard", label: "Difficult" },
                    { key: "good", label: "Good" },
                    { key: "easy", label: "Easy" },
                  ].map(({ key, label }) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={key === "good" ? "primary" : "secondary"}
                      onClick={async () => {
                        await api.reviewFlashcard(activeCard.id, key as "again" | "hard" | "good" | "easy");
                        setFlipped(false);
                        setIndex(deckSize > 0 ? (position + 1) % deckSize : 0);
                        await reload();
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
