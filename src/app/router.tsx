import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { TaskListSkeleton } from "@/components/ui/skeleton";

const Dashboard = lazy(() => import("@/features/dashboard/Dashboard"));
const Playlists = lazy(() => import("@/features/playlists/Playlists"));
const Planner = lazy(() => import("@/features/planner/Planner"));
const CalendarPage = lazy(() => import("@/features/calendar/CalendarPage"));
const Progress = lazy(() => import("@/features/analytics/Progress"));
const Settings = lazy(() => import("@/features/settings/Settings"));
const AiSettings = lazy(() => import("@/features/ai-providers/AiSettings"));
const Prompts = lazy(() => import("@/features/settings/Prompts"));
const Learn = lazy(() => import("@/features/workspace/Learn"));
const Notes = lazy(() => import("@/features/notes/Notes"));
const Quizzes = lazy(() => import("@/features/quizzes/Quizzes"));
const Flashcards = lazy(() => import("@/features/flashcards/Flashcards"));

function RouteFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <TaskListSkeleton rows={3} />
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<RouteFallback />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="planner"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Planner />
            </Suspense>
          }
        />
        <Route
          path="calendar"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CalendarPage />
            </Suspense>
          }
        />
        <Route
          path="playlists"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Playlists />
            </Suspense>
          }
        />
        <Route
          path="playlists/:id"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Playlists />
            </Suspense>
          }
        />
        <Route
          path="progress"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Progress />
            </Suspense>
          }
        />
        <Route
          path="learn/:itemId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Learn />
            </Suspense>
          }
        />
        <Route
          path="notes"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Notes />
            </Suspense>
          }
        />
        <Route
          path="quizzes"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Quizzes />
            </Suspense>
          }
        />
        <Route
          path="flashcards"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Flashcards />
            </Suspense>
          }
        />
        <Route
          path="settings/ai"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AiSettings />
            </Suspense>
          }
        />
        <Route
          path="settings/prompts"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Prompts />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Settings />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
