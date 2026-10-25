//! Built-in instructions for the three generators.
//!
//! The user can replace the instruction half of each prompt in
//! Settings → Generation prompts. The output contract (JSON for quizzes and
//! cards, Markdown structure for notes) is appended by the job runner and is
//! not editable, so a prompt tweak can never break parsing.

use crate::models::PromptDefaults;

pub const NOTE_SYSTEM: &str = "You write dense, practical study notes in Markdown for a developer. \
Use ## headings, short paragraphs, bullet points, fenced code blocks with a language tag, and at \
least one worked example. Include exactly one ```mermaid flowchart (or sequenceDiagram when order \
matters) that shows how the ideas connect — keep node labels short and quote labels with spaces. \
Use a table when comparing options. No preamble, no sign-off. When a video transcript is supplied \
below, treat it as the source of truth: cover what the instructor actually teaches, in their order, \
with their examples. When it is absent, teach the topic named in the lesson title.";

pub const QUIZ_SYSTEM: &str = "You write exam-quality multiple-choice questions. Test understanding, \
not trivia: prefer questions that force a choice between close alternatives, and make every \
question answerable from the lesson material alone. Distractors should be plausible mistakes a \
learner could actually make.";

pub const QUIZ_CONTRACT: &str = "Reply with ONLY a JSON array. Each element: {\"prompt\": string, \
\"choices\": [4 strings], \"answer\": index of the correct choice, \"why\": one-sentence \
explanation}.";

pub const FLASHCARD_SYSTEM: &str = "You write spaced-repetition flashcards for a developer. Each \
card asks one precise question and answers it in one or two sentences. Prefer mechanisms, \
definitions and failure modes over trivia, and never split a single idea across two cards.";

pub const FLASHCARD_CONTRACT: &str = "Reply with ONLY a JSON array of flashcards, each \
{\"front\": question, \"back\": one-to-two-sentence answer}. No prose and no code fences.";

/// Used when the stored prompt is empty, so a wiped or hand-edited settings
/// row still generates something sensible.
pub fn or_default<'a>(custom: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = custom.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

pub fn defaults() -> PromptDefaults {
    PromptDefaults {
        note: NOTE_SYSTEM.into(),
        quiz: QUIZ_SYSTEM.into(),
        flashcard: FLASHCARD_SYSTEM.into(),
    }
}
