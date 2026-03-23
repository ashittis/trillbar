import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Film, ChevronRight } from "lucide-react";
import { api, SessionOut } from "../../lib/api";
import { useStudioStore } from "../../lib/store";

const STATUS_COLOR: Record<string, string> = {
  created:    "#6F6F78",
  uploaded:   "#4C8DFF",
  extracting: "#FFB020",
  ready:      "#3CCB7F",
  dubbing:    "#FFB020",
  done:       "#3CCB7F",
};

const STATUS_LABEL: Record<string, string> = {
  created:    "Created",
  uploaded:   "Uploaded",
  extracting: "Extracting…",
  ready:      "Ready",
  dubbing:    "Dubbing…",
  done:       "Done",
};

export function Projects() {
  const navigate = useNavigate();
  const setSession = useStudioStore((s) => s.setSession);
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sessions.list()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleOpen = (session: SessionOut) => {
    setSession(session);
    if (session.status === "done" || session.status === "dubbing") {
      navigate("/dub-studio");
    } else {
      navigate("/voice-lab");
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--studio-bg)" }}>
      {/* Header */}
      <div
        className="h-12 border-b flex items-center justify-between px-6"
        style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="text-[15px] font-bold tracking-tight hover:opacity-80 transition-opacity"
          style={{ color: "#4ade80" }}
        >
          trillbar
        </button>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
          style={{ backgroundColor: "var(--studio-elevated)", color: "var(--studio-text-primary)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </button>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-[18px] font-semibold mb-6" style={{ color: "var(--studio-text-primary)" }}>
          Projects
        </h2>

        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--studio-text-muted)" }}>Loading…</p>
        ) : sessions.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed p-12 text-center"
            style={{ borderColor: "var(--studio-border)" }}
          >
            <Film className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--studio-text-muted)" }} />
            <p className="text-[13px] mb-4" style={{ color: "var(--studio-text-muted)" }}>
              No projects yet. Upload a video to get started.
            </p>
            <button
              onClick={() => navigate("/")}
              className="text-[12px] px-4 py-2 rounded-md hover:opacity-80 transition-opacity"
              style={{ backgroundColor: "var(--studio-elevated)", color: "var(--studio-text-primary)" }}
            >
              New Project
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => {
              const color = STATUS_COLOR[s.status] ?? "#6F6F78";
              return (
                <button
                  key={s.id}
                  onClick={() => handleOpen(s)}
                  className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:border-[var(--studio-text-muted)]"
                  style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Film className="w-4 h-4 shrink-0" style={{ color: "var(--studio-text-muted)" }} />
                    <div className="min-w-0">
                      <div className="text-[13px] truncate" style={{ color: "var(--studio-text-primary)" }}>
                        {s.name}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--studio-text-muted)" }}>
                        {s.source_language.toUpperCase()} → {s.target_language.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ color, backgroundColor: `${color}18` }}
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--studio-text-muted)" }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
