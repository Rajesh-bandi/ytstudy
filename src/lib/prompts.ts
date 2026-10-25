import type { PromptDefaults } from "@/types";

/**
 * Mirrors `src-tauri/src/prompts.rs`. The desktop app asks Rust for these so
 * Reset always restores the prompt the generator would actually fall back to;
 * this copy exists only so the browser preview can behave the same way.
 */
export const DEFAULT_PROMPTS: PromptDefaults = {
  note: [
    "You write dense, practical study notes in Markdown for a developer.",
    "Use ## headings, short paragraphs, bullet points, fenced code blocks with a language tag,",
    "and at least one worked example. Include exactly one ```mermaid flowchart (or sequenceDiagram",
    "when order matters) that shows how the ideas connect — keep node labels short and quote labels",
    "with spaces. Use a table when comparing options. No preamble, no sign-off. When a video",
    "transcript is supplied below, treat it as the source of truth: cover what the instructor",
    "actually teaches, in their order, with their examples. When it is absent, teach the topic",
    "named in the lesson title.",
  ].join(" "),
  quiz: [
    "You write exam-quality multiple-choice questions. Test understanding, not trivia: prefer",
    "questions that force a choice between close alternatives, and make every question answerable",
    "from the lesson material alone. Distractors should be plausible mistakes a learner could",
    "actually make.",
  ].join(" "),
  flashcard: [
    "You write spaced-repetition flashcards for a developer. Each card asks one precise question",
    "and answers it in one or two sentences. Prefer mechanisms, definitions and failure modes over",
    "trivia, and never split a single idea across two cards.",
  ].join(" "),
};
