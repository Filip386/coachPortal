import React, { useState } from "react";
import { RefreshCw, Check, Clock, BellOff } from "lucide-react";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner } from "../components/shared";
import { useData } from "../context/DataContext";

interface NotificationsScreenProps {
  go: (id: ScreenId) => void;
  goBack?: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  High: COLORS.red,
  Normal: COLORS.navy,
  Low: COLORS.mute,
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ go, goBack }) => {
  const { tasks, tasksLoading, tasksError, refreshTasks, completeTask } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshTasks().catch(() => {});
    setRefreshing(false);
  };

  const handleComplete = async (taskId: string) => {
    setError(null);
    setCompletingId(taskId);
    try {
      await completeTask(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark the task as done.");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Coach Timeline"
        title="Notifications"
        onBack={() => (goBack ? goBack() : go("home"))}
        action={
          <button
            onClick={refreshData}
            disabled={refreshing}
            style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: refreshing ? "not-allowed" : "pointer" }}
          >
            <RefreshCw size={17} color={COLORS.navy} strokeWidth={2} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}
      {tasksError && !error && <ErrorBanner message={`Couldn't load notifications: ${tasksError}`} onRetry={refreshData} />}

      {tasksLoading && tasks.length === 0 && <LoadingSpinner label="Loading notifications…" />}

      {(!tasksLoading || tasks.length > 0) && (
        <div style={{ padding: "0 22px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.length === 0 && !tasksLoading && (
            <div style={{ textAlign: "center", padding: "50px 20px", color: COLORS.mute, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <BellOff size={28} color={COLORS.mute} strokeWidth={1.6} />
              <div style={{ fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>NO OPEN TASKS</div>
            </div>
          )}

          {tasks.map((task) => {
            const isCompleting = completingId === task.id;
            return (
              <div
                key={task.id}
                style={{
                  background: "#fff",
                  border: `1px solid ${COLORS.line}`,
                  borderLeft: `3px solid ${PRIORITY_COLOR[task.priority]}`,
                  borderRadius: 16,
                  padding: 14,
                  opacity: isCompleting ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {task.priority === "High" && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FEF2F2", padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: COLORS.red, textTransform: "uppercase", marginBottom: 6 }}>
                        High Priority
                      </div>
                    )}
                    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 15, color: COLORS.navy }}>
                      {task.subject}
                    </div>
                    {task.description && (
                      <div style={{ fontSize: 12.5, color: COLORS.mute, marginTop: 4, lineHeight: 1.4 }}>
                        {task.description}
                      </div>
                    )}
                    {task.dueDate && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, color: COLORS.mute, fontSize: 11, fontFamily: monoStack, letterSpacing: "0.04em" }}>
                        <Clock size={12} />
                        Due {new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleComplete(task.id)}
                    disabled={isCompleting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: COLORS.navy,
                      color: "#fff",
                      border: 0,
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: isCompleting ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Check size={13} strokeWidth={2.5} />
                    Mark Complete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
