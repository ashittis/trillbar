import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, CheckCircle2, Loader2, Mic, Play, Pause,
  Edit2, Check, XCircle, Sliders, Info, Sparkles,
} from "lucide-react";
import { FloatingNav } from "./FloatingNav";
import { api, type ActorOut, type DialogueLineOut, type CleanSettings } from "../../lib/api";
import { useStudioStore } from "../../lib/store";

const SPEAKER_COLORS = ["#4C8DFF", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444"];
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function WaveformBar({ id, color, count = 28 }: { id: string; color: string; count?: number }) {
  const bars = Array.from({ length: count }, (_, i) => {
    const seed = id.charCodeAt(i % id.length) + i;
    return 4 + Math.abs(Math.sin(seed * 1.7)) * 20;
  });
  return (
    <div className="flex items-center gap-[2px] h-7">
      {bars.map((h, i) => (
        <div key={i} style={{ width: 2, height: h, backgroundColor: color, opacity: 0.45, borderRadius: 1 }} />
      ))}
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Extraction Panel (unchanged from before)
// ---------------------------------------------------------------------------
interface Step { label: string; status: "pending" | "running" | "done" | "failed"; message?: string; }

function ExtractionPanel({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const runningIdx = steps.findIndex((s) => s.status === "running");
  const pct = ((doneCount + (runningIdx >= 0 ? 0.5 : 0)) / steps.length) * 100;
  return (
    <div className="max-w-lg mx-auto w-full pt-16 px-6">
      <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center animate-pulse"
        style={{ backgroundColor: "rgba(76,141,255,0.12)" }}>
        <Mic className="w-8 h-8" style={{ color: "var(--studio-active)" }} />
      </div>
      <h2 className="text-center text-[22px] font-semibold mb-1" style={{ color: "var(--studio-text-primary)" }}>
        Analyzing your video
      </h2>
      <p className="text-center text-[13px] mb-8" style={{ color: "var(--studio-text-muted)" }}>
        Detecting speakers and extracting voice profiles
      </p>
      <div className="h-1 rounded-full overflow-hidden mb-6" style={{ backgroundColor: "var(--studio-elevated)" }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: "var(--studio-active)" }} />
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl transition-colors"
            style={{
              backgroundColor: step.status === "running" ? "rgba(76,141,255,0.08)" : "var(--studio-elevated)",
              border: step.status === "running" ? "1px solid rgba(76,141,255,0.2)" : "1px solid transparent",
            }}>
            <div className="shrink-0 w-6 flex items-center justify-center">
              {step.status === "done" && <CheckCircle2 className="w-5 h-5" style={{ color: "var(--studio-success)" }} />}
              {step.status === "running" && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--studio-active)" }} />}
              {step.status === "pending" && <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "var(--studio-border)" }} />}
              {step.status === "failed" && <XCircle className="w-5 h-5" style={{ color: "var(--studio-error)" }} />}
            </div>
            <div className="flex-1">
              <div className="text-[14px]" style={{ color: step.status === "pending" ? "var(--studio-text-muted)" : "var(--studio-text-primary)" }}>
                {step.label}
              </div>
              {step.message && step.status !== "pending" && (
                <div className="text-[11px] mt-0.5" style={{ color: "var(--studio-text-muted)" }}>{step.message}</div>
              )}
            </div>
            {step.status === "done" && <span className="text-[11px] shrink-0" style={{ color: "var(--studio-success)" }}>Done</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio Player Helper
// ---------------------------------------------------------------------------
function AudioBtn({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!ref.current) {
      ref.current = new Audio(`${BASE}${url}`);
      ref.current.onended = () => setPlaying(false);
    }
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  return (
    <button onClick={toggle} className="p-1.5 rounded-md hover:opacity-80 transition-opacity"
      style={{ backgroundColor: "var(--studio-elevated)" }}>
      {playing ? <Pause className="w-3 h-3" style={{ color: "var(--studio-text-primary)" }} /> :
        <Play className="w-3 h-3" style={{ color: "var(--studio-text-primary)" }} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice Clean Panel
// ---------------------------------------------------------------------------
function VoiceCleanPanel({ actor, sessionId, onDone }: {
  actor: ActorOut; sessionId: string; onDone: () => void;
}) {
  const [settings, setSettings] = useState<CleanSettings>({
    highpass: true, hp_freq: 80, denoise: true, noise_floor: -25,
    bass: 0, treble: 0, normalize: true,
  });
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pollJob = (jobId: string, onDone: (msg: string) => void, onFail: (err: string) => void) => {
    const url = api.voiceLab.jobEventsUrl(sessionId, jobId);
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.status === "done") { onDone(ev.message); es.close(); }
        if (ev.status === "failed") { onFail(ev.error || ev.message); es.close(); }
      } catch { /* ignore */ }
    };
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const { job_id } = await api.voiceLab.cleanPreview(sessionId, actor.id, settings);
      pollJob(job_id,
        (msg) => {
          if (msg.startsWith("preview:")) {
            setPreviewUrl(`/api/upload/files/${msg.slice(8)}`);
          }
          setPreviewing(false);
        },
        (err) => { toast.error(err); setPreviewing(false); }
      );
    } catch (err) { toast.error(err instanceof Error ? err.message : "Preview failed"); setPreviewing(false); }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const { job_id } = await api.voiceLab.cleanApply(sessionId, actor.id, settings);
      pollJob(job_id,
        () => { toast.success("Voice cleaned and saved"); setApplying(false); onDone(); },
        (err) => { toast.error(err); setApplying(false); }
      );
    } catch (err) { toast.error(err instanceof Error ? err.message : "Apply failed"); setApplying(false); }
  };

  const Slider = ({ label, value, min, max, step, format, onChange }: {
    label: string; value: number; min: number; max: number; step: number;
    format?: (v: number) => string; onChange: (v: number) => void;
  }) => (
    <div className="flex items-center gap-3">
      <span className="text-[12px] w-28 shrink-0" style={{ color: "var(--studio-text-muted)" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-blue-500" />
      <span className="text-[11px] w-12 text-right tabular-nums" style={{ color: "var(--studio-text-primary)" }}>
        {format ? format(value) : value}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--studio-text-primary)" }}>
          <Sliders className="w-4 h-4" style={{ color: "var(--studio-active)" }} />
          Voice Cleaning
        </h3>
      </div>

      {/* A/B comparison */}
      <div className="flex gap-3">
        {actor.sample_audio_url && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1" style={{ backgroundColor: "var(--studio-elevated)" }}>
            <AudioBtn url={actor.sample_audio_url} />
            <span className="text-[11px]" style={{ color: "var(--studio-text-muted)" }}>Original</span>
          </div>
        )}
        {previewUrl && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1" style={{ backgroundColor: "var(--studio-elevated)" }}>
            <AudioBtn url={previewUrl} />
            <span className="text-[11px]" style={{ color: "var(--studio-success)" }}>Cleaned</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Slider label="Noise Reduction" value={settings.noise_floor} min={-40} max={-10} step={1}
          format={(v) => `${v} dB`}
          onChange={(v) => setSettings((s) => ({ ...s, noise_floor: v }))} />
        <Slider label="High-pass" value={settings.hp_freq} min={40} max={200} step={10}
          format={(v) => `${v} Hz`}
          onChange={(v) => setSettings((s) => ({ ...s, hp_freq: v }))} />
        <Slider label="Bass" value={settings.bass} min={-12} max={12} step={1}
          format={(v) => `${v > 0 ? "+" : ""}${v} dB`}
          onChange={(v) => setSettings((s) => ({ ...s, bass: v }))} />
        <Slider label="Treble" value={settings.treble} min={-12} max={12} step={1}
          format={(v) => `${v > 0 ? "+" : ""}${v} dB`}
          onChange={(v) => setSettings((s) => ({ ...s, treble: v }))} />
      </div>

      <div className="flex gap-2">
        <button onClick={handlePreview} disabled={previewing}
          className="flex-1 py-2 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: "var(--studio-elevated)", color: "var(--studio-text-primary)" }}>
          {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Preview
        </button>
        <button onClick={handleApply} disabled={applying}
          className="flex-1 py-2 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
          {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Apply & Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample Selection + Clone Panel (center content per character)
// ---------------------------------------------------------------------------
function CharacterPanel({ actor, actorIndex, sessionId }: {
  actor: ActorOut; actorIndex: number; sessionId: string;
}) {
  const queryClient = useQueryClient();
  const color = SPEAKER_COLORS[actorIndex % SPEAKER_COLORS.length];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showClean, setShowClean] = useState(false);
  const [cloneInProgress, setCloneInProgress] = useState(false);

  const { data: samples = [] } = useQuery({
    queryKey: ["actor-samples", sessionId, actor.id],
    queryFn: () => api.voiceLab.listActorSamples(sessionId, actor.id),
  });

  // Auto-select first 3 samples on load
  useEffect(() => {
    if (samples.length > 0 && selectedIds.size === 0) {
      const autoSelect = new Set(samples.slice(0, Math.min(3, samples.length)).map((s) => s.id));
      setSelectedIds(autoSelect);
    }
  }, [samples]);

  const toggleSample = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleClone = async () => {
    setCloneInProgress(true);
    try {
      const lineIds = Array.from(selectedIds);
      const { job_id } = await api.voiceLab.cloneActor(sessionId, actor.id, lineIds.length > 0 ? lineIds : undefined);
      const url = api.voiceLab.jobEventsUrl(sessionId, job_id);
      const es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.status === "done" || ev.status === "failed") {
            setCloneInProgress(false);
            queryClient.invalidateQueries({ queryKey: ["actors", sessionId] });
            if (ev.status === "failed") toast.error(ev.error || "Clone failed");
            es.close();
          }
        } catch { /* ignore */ }
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
      setCloneInProgress(false);
    }
  };

  const isReady = actor.cloning_status === "ready";
  const isProcessing = actor.cloning_status === "processing" || cloneInProgress;

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Step header */}
      <div>
        <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--studio-text-primary)" }}>
          {isReady ? "Voice Ready" : "Step 1: Select Voice Samples"}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--studio-text-muted)" }}>
          {isReady
            ? `${actor.label}'s voice has been cloned successfully.`
            : `Choose at least 2 samples (recommended 3-5) of ${actor.label}'s dialogue for accurate voice analysis`}
        </p>
      </div>

      {/* Success state */}
      {isReady && (
        <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: "rgba(60,203,127,0.08)", border: "1px solid rgba(60,203,127,0.2)" }}>
          <CheckCircle2 className="w-6 h-6 shrink-0" style={{ color: "var(--studio-success)" }} />
          <div>
            <div className="text-[13px] font-medium" style={{ color: "var(--studio-success)" }}>Voice cloned</div>
            {actor.elevenlabs_voice_id && (
              <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--studio-text-muted)" }}>
                ID: {actor.elevenlabs_voice_id.slice(0, 16)}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Samples list */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--studio-border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "var(--studio-elevated)" }}>
          <span className="text-[13px] font-medium" style={{ color: "var(--studio-text-primary)" }}>Available Samples</span>
          <span className="text-[12px]" style={{ color: "var(--studio-active)" }}>{selectedIds.size} selected</span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--studio-border)" }}>
          {samples.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--studio-text-muted)" }}>
              No samples found for this character.
            </div>
          )}
          {samples.map((sample) => {
            const selected = selectedIds.has(sample.id);
            const dur = sample.end_time - sample.start_time;
            return (
              <div key={sample.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:opacity-90"
                onClick={() => toggleSample(sample.id)}
                style={{
                  backgroundColor: selected ? "rgba(76,141,255,0.06)" : "var(--studio-surface)",
                  borderLeft: selected ? `3px solid ${color}` : "3px solid transparent",
                }}>
                <div className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    borderColor: selected ? "var(--studio-active)" : "var(--studio-border)",
                    backgroundColor: selected ? "var(--studio-active)" : "transparent",
                  }}>
                  {selected && <Check className="w-3 h-3 text-white" />}
                </div>
                {sample.original_audio_url && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <AudioBtn url={sample.original_audio_url} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate" style={{ color: "var(--studio-text-primary)" }}>
                    {sample.transcript_text || "[No transcript]"}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--studio-text-muted)" }}>
                    {fmt(sample.start_time)} · {dur.toFixed(1)}s
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <WaveformBar id={sample.id} color={selected ? color : "var(--studio-text-muted)"} count={20} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clone CTA */}
      {!isReady && (
        <button onClick={handleClone} disabled={selectedIds.size < 2 || isProcessing}
          className="w-full py-3 rounded-xl text-[14px] font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isProcessing ? "Analyzing voice..." : `Analyze Voice (${selectedIds.size} samples)`}
        </button>
      )}

      {/* Tip */}
      {!isReady && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ backgroundColor: "var(--studio-elevated)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--studio-active)" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--studio-text-muted)" }}>
            Select samples with clear speech, minimal background noise, and varied emotional delivery for best analysis results.
            Longer samples (2-3s) work better.
          </p>
        </div>
      )}

      {/* Voice cleaning toggle */}
      <button onClick={() => setShowClean(!showClean)}
        className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
        style={{ backgroundColor: "var(--studio-elevated)", color: "var(--studio-text-muted)" }}>
        <Sliders className="w-3.5 h-3.5" />
        {showClean ? "Hide voice cleaning" : "Clean voice before cloning"}
        {actor.cleaned_audio_url && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(60,203,127,0.15)", color: "var(--studio-success)" }}>Cleaned</span>}
      </button>

      {showClean && (
        <VoiceCleanPanel actor={actor} sessionId={sessionId}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["actors", sessionId] })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main VoiceLab Component
// ---------------------------------------------------------------------------
export function VoiceLab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = useStudioStore((s) => s.sessionId);
  const session = useStudioStore((s) => s.session);

  const [extractionJobId, setExtractionJobId] = useState<string | null>(null);
  const [extractionStep, setExtractionStep] = useState<Step[]>([
    { label: "Extract audio from video", status: "pending" },
    { label: "Detect speakers", status: "pending" },
    { label: "Build actor profiles", status: "pending" },
    { label: "Transcribe dialogue", status: "pending" },
  ]);
  const [extractionDone, setExtractionDone] = useState(false);
  const [activeActorIdx, setActiveActorIdx] = useState(0);
  const probedRef = useRef(false);

  const { data: actors = [] } = useQuery<ActorOut[]>({
    queryKey: ["actors", sessionId],
    queryFn: () => api.voiceLab.listActors(sessionId!),
    enabled: !!sessionId && extractionDone,
    refetchInterval: (query) => {
      const data = query.state.data as ActorOut[] | undefined;
      const allSettled = data?.every((a) => a.cloning_status === "ready" || a.cloning_status === "failed");
      return allSettled ? false : 2000;
    },
  });

  const readyCount = actors.filter((a) => a.cloning_status === "ready").length;
  const allCloned = actors.length > 0 && readyCount === actors.length;

  // SSE for extraction job
  useEffect(() => {
    if (!extractionJobId || !sessionId) return;
    const url = api.voiceLab.jobEventsUrl(sessionId, extractionJobId);
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        const { progress, message, status } = ev;
        setExtractionStep((prev) => {
          const next = [...prev];
          if (status === "failed") {
            const idx = next.findIndex((s) => s.status !== "done");
            if (idx !== -1) next[idx] = { ...next[idx], status: "failed", message };
            return next;
          }
          if (progress <= 30) {
            next[0] = { ...next[0], status: progress < 30 ? "running" : "done", message };
          } else if (progress <= 60) {
            next[0] = { ...next[0], status: "done" };
            next[1] = { ...next[1], status: progress < 60 ? "running" : "done", message };
          } else if (progress <= 80) {
            next[0] = { ...next[0], status: "done" };
            next[1] = { ...next[1], status: "done" };
            next[2] = { ...next[2], status: progress < 80 ? "running" : "done", message };
          } else {
            next[0] = { ...next[0], status: "done" };
            next[1] = { ...next[1], status: "done" };
            next[2] = { ...next[2], status: "done" };
            next[3] = { ...next[3], status: status === "done" ? "done" : "running", message };
          }
          return next;
        });
        if (status === "done") { setExtractionDone(true); queryClient.invalidateQueries({ queryKey: ["actors", sessionId] }); es.close(); }
        if (status === "failed") { toast.error(ev.error || "Extraction failed"); es.close(); }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [extractionJobId, sessionId, queryClient]);

  // Probe on mount
  useEffect(() => {
    if (!sessionId || probedRef.current) return;
    probedRef.current = true;
    (async () => {
      try {
        const existing = await api.voiceLab.listActors(sessionId);
        if (existing.length > 0) { setExtractionDone(true); return; }
      } catch { /* ignore */ }
      const status = useStudioStore.getState().session?.status;
      if (status === "ready") { setExtractionDone(true); return; }
      if (status === "extracting") return;
      try {
        const { job_id } = await api.voiceLab.startExtraction(sessionId);
        setExtractionJobId(job_id);
        setExtractionStep((prev) => prev.map((s, i) => i === 0 ? { ...s, status: "running" } : s));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      }
    })();
  }, [sessionId]);

  const handleCompleteAll = async () => {
    if (!sessionId) return;
    try {
      await api.voiceLab.cloneAll(sessionId);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["actors", sessionId] }), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone all failed");
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--studio-bg)" }}>
        <FloatingNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px]" style={{ color: "var(--studio-text-muted)" }}>
            No session active.{" "}
            <button onClick={() => navigate("/")} className="underline">Upload a video first</button>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--studio-bg)" }}>
      <FloatingNav />
      {/* Header */}
      <div className="h-12 border-b flex items-center px-6 justify-between shrink-0"
        style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}>
        <span className="text-[13px] font-medium" style={{ color: "var(--studio-text-primary)" }}>Voice Lab</span>
        <div className="flex items-center gap-4">
          <span className="text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
            {readyCount} / {actors.length} Complete
          </span>
          <button onClick={() => navigate("/dub-studio")} disabled={!allCloned}
            className="px-4 py-1.5 rounded text-[13px] flex items-center gap-2 transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
            Complete All Voices <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {!extractionDone ? (
          <div className="flex-1 overflow-y-auto">
            <ExtractionPanel steps={extractionStep} />
          </div>
        ) : (
          <>
            {/* Left sidebar — Characters */}
            <div className="w-[200px] border-r overflow-y-auto shrink-0"
              style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}>
              <div className="px-4 py-3 text-[11px] uppercase tracking-widest" style={{ color: "var(--studio-text-muted)" }}>
                Characters
              </div>
              {actors.map((actor, i) => {
                const c = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
                const isActive = i === activeActorIdx;
                const isReady = actor.cloning_status === "ready";
                return (
                  <button key={actor.id}
                    onClick={() => setActiveActorIdx(i)}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{
                      backgroundColor: isActive ? "var(--studio-elevated)" : "transparent",
                      borderLeft: `3px solid ${isActive ? c : "transparent"}`,
                    }}>
                    <div className="text-[13px] font-medium truncate" style={{ color: "var(--studio-text-primary)" }}>
                      {actor.label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--studio-text-muted)" }}>
                      {actor.samples_count} samples
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: isReady ? "var(--studio-success)" : c }}>
                      {isReady ? "Voice Ready" : actor.cloning_status === "processing" ? "Analyzing..." : "Select Samples"}
                    </div>
                  </button>
                );
              })}

              {/* Clone all pending at bottom */}
              {actors.some((a) => a.cloning_status === "pending") && (
                <div className="px-4 py-3 border-t" style={{ borderColor: "var(--studio-border)" }}>
                  <button onClick={handleCompleteAll}
                    className="w-full py-2 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
                    Clone All Voices
                  </button>
                </div>
              )}
            </div>

            {/* Center — Character panel */}
            <div className="flex-1 overflow-y-auto">
              {actors.length === 0 ? (
                <div className="flex items-center gap-2 p-8 text-[13px]" style={{ color: "var(--studio-text-muted)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading actors...
                </div>
              ) : (
                <CharacterPanel
                  key={actors[activeActorIdx]?.id}
                  actor={actors[activeActorIdx]}
                  actorIndex={activeActorIdx}
                  sessionId={sessionId}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
