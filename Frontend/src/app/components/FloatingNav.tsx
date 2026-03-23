import { useLocation, useNavigate } from "react-router";
import { useStudioStore } from "../../lib/store";

const STEPS = [
  { path: "/", label: "Upload", num: 1 },
  { path: "/voice-lab", label: "Voice Lab", num: 2 },
  { path: "/dub-studio", label: "Dub Studio", num: 3 },
];

export function FloatingNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useStudioStore((s) => s.session);

  const currentStep = STEPS.findIndex((s) => s.path === location.pathname) + 1 || 1;

  return (
    <div
      className="h-12 border-b flex items-center px-6 gap-6 shrink-0"
      style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}
    >
      {/* Logo */}
      <div className="text-[13px] font-semibold tracking-tight shrink-0" style={{ color: "var(--studio-text-primary)" }}>
        TrillBar
      </div>

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: "var(--studio-border)" }} />

      {/* Step breadcrumb */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isActive = step.num === currentStep;
          const isDone = step.num < currentStep;
          // Step 1 always clickable; steps 2+ require an active session
          const isClickable = !isActive && (step.num === 1 || (!!session && step.num <= currentStep));
          return (
            <div key={step.path} className="flex items-center gap-1">
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px]"
                onClick={isClickable ? () => navigate(step.path) : undefined}
                style={{
                  backgroundColor: isActive ? "var(--studio-active)20" : "transparent",
                  color: isActive
                    ? "var(--studio-active)"
                    : isDone
                    ? "var(--studio-success)"
                    : "var(--studio-text-muted)",
                  cursor: isClickable ? "pointer" : "default",
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                  style={{
                    backgroundColor: isActive
                      ? "var(--studio-active)"
                      : isDone
                      ? "var(--studio-success)"
                      : "var(--studio-elevated)",
                    color: isActive || isDone ? "#fff" : "var(--studio-text-muted)",
                  }}
                >
                  {isDone ? "✓" : step.num}
                </span>
                <span>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="text-[10px] mx-0.5" style={{ color: "var(--studio-border)" }}>›</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Session info */}
      {session && (
        <>
          <div className="w-px h-4 shrink-0" style={{ backgroundColor: "var(--studio-border)" }} />
          <div className="text-[11px]" style={{ color: "var(--studio-text-muted)" }}>
            {session.name} · {session.source_language.toUpperCase()} → {session.target_language.toUpperCase()}
          </div>
        </>
      )}
    </div>
  );
}
