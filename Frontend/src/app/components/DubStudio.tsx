import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Play, Pause, Loader2, CheckCircle2, Download,
  Mic, MicOff, Volume2, VolumeX, Film, Sparkles, Square, X,
} from "lucide-react";
import { FloatingNav } from "./FloatingNav";
import { api, type ActorOut, type DialogueLineOut, type TakeOut } from "../../lib/api";
import { useStudioStore } from "../../lib/store";

const SPEAKER_COLORS = ["#4C8DFF", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444"];
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function WaveformBar({ id, color, count = 24 }: { id: string; color: string; count?: number }) {
  const bars = Array.from({ length: count }, (_, i) => {
    const seed = id.charCodeAt(i % id.length) + i;
    return 3 + Math.abs(Math.sin(seed * 1.7)) * 16;
  });
  return (
    <div className="flex items-center gap-[2px] h-6">
      {bars.map((h, i) => (
        <div key={i} style={{ width: 2, height: h, backgroundColor: color, opacity: 0.4, borderRadius: 1 }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoPlayer with seek support
// ---------------------------------------------------------------------------
function VideoPlayer({ url, seekTime }: { url: string; seekTime: number | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (seekTime !== null && videoRef.current && isFinite(seekTime)) {
      videoRef.current.currentTime = seekTime;
      setCurrent(seekTime);
    }
  }, [seekTime]);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  };
  const seek = (v: number) => { if (videoRef.current) { videoRef.current.currentTime = v; setCurrent(v); } };
  const changeVolume = (v: number) => { if (videoRef.current) { videoRef.current.volume = v; setVolume(v); setMuted(v === 0); } };
  const toggleMute = () => { if (videoRef.current) { videoRef.current.muted = !muted; setMuted(!muted); } };

  return (
    <div className="flex flex-col" style={{ backgroundColor: "#000" }}>
      <video ref={videoRef} src={url}
        className="w-full object-contain" style={{ maxHeight: "45vh" }}
        onTimeUpdate={() => setCurrent(videoRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)} />
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ backgroundColor: "var(--studio-surface)", borderTop: "1px solid var(--studio-border)" }}>
        <button onClick={toggle} className="shrink-0 hover:opacity-80" style={{ color: "var(--studio-text-primary)" }}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <input type="range" min={0} max={duration || 1} step={0.1} value={current}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="flex-1 h-1 cursor-pointer accent-[var(--studio-active)]" />
        <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--studio-text-muted)" }}>
          {fmt(current)} / {fmt(duration)}
        </span>
        <button onClick={toggleMute} className="shrink-0 hover:opacity-80" style={{ color: "var(--studio-text-muted)" }}>
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="w-16 h-1 cursor-pointer accent-[var(--studio-active)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AudioPlayer
// ---------------------------------------------------------------------------
function AudioBtn({ url, label }: { url: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  const fullUrl = url.startsWith("http") ? url : `${BASE}${url}`;
  const toggle = () => {
    if (!ref.current) { ref.current = new Audio(fullUrl); ref.current.onended = () => setPlaying(false); }
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:opacity-80 transition-opacity"
      style={{ backgroundColor: "var(--studio-elevated)", color: "var(--studio-text-primary)" }}>
      {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// useAudioRecorder hook
// ---------------------------------------------------------------------------
function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      setAudioBlob(new Blob(chunksRef.current, { type: mimeType }));
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  };

  const stop = () => { recorderRef.current?.stop(); setRecording(false); };
  const clear = () => setAudioBlob(null);

  return { recording, audioBlob, start, stop, clear };
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------
function Slider({ label, min, max, step, value, onChange, format }: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] w-24 shrink-0" style={{ color: "var(--studio-text-muted)" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 cursor-pointer accent-[var(--studio-active)]" />
      <span className="text-[12px] w-12 text-right shrink-0 tabular-nums" style={{ color: "var(--studio-text-primary)" }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Takes/Synthesis Panel for active dialogue line
// ---------------------------------------------------------------------------
function LineWorkArea({ line, actors, sessionId }: {
  line: DialogueLineOut; actors: ActorOut[]; sessionId: string;
}) {
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder();
  const [synthJobId, setSynthJobId] = useState<string | null>(null);

  const actor = actors.find((a) => a.id === line.actor_id);
  const actorIdx = actors.findIndex((a) => a.id === line.actor_id);
  const color = actorIdx >= 0 ? SPEAKER_COLORS[actorIdx % SPEAKER_COLORS.length] : SPEAKER_COLORS[0];

  const { data: takes = [], refetch: refetchTakes } = useQuery({
    queryKey: ["line-takes", sessionId, line.id],
    queryFn: () => api.dubStudio.listLineTakes(sessionId, line.id),
    refetchInterval: (query) => {
      const data = query.state.data as TakeOut[] | undefined;
      const hasConverting = data?.some((t) => t.status === "converting");
      return hasConverting ? 2000 : false;
    },
  });

  // SSE for synthesis
  useEffect(() => {
    if (!synthJobId) return;
    const url = api.dubStudio.jobEventsUrl(sessionId, synthJobId);
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.status === "done" || ev.status === "failed") {
          if (ev.status === "failed") toast.error(ev.error || "Synthesis failed");
          refetchTakes();
          setSynthJobId(null);
          es.close();
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [synthJobId, sessionId, refetchTakes]);

  // Upload recorded blob
  useEffect(() => {
    if (!recorder.audioBlob) return;
    (async () => {
      try {
        await api.dubStudio.recordTake(sessionId, line.id, recorder.audioBlob!);
        recorder.clear();
        refetchTakes();
        toast.success("Take recorded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    })();
  }, [recorder.audioBlob]);

  const handleSynthesize = async (takeId: string) => {
    try {
      const { job_id } = await api.dubStudio.synthesizeTake(sessionId, takeId);
      setSynthJobId(job_id);
      refetchTakes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Synthesis failed");
    }
  };

  const handleApprove = async (takeId: string, approved: boolean) => {
    try {
      await api.dubStudio.updateTake(sessionId, takeId, { approved: !approved });
      refetchTakes();
      queryClient.invalidateQueries({ queryKey: ["dub-lines", sessionId] });
    } catch { /* ignore */ }
  };

  const dur = line.end_time - line.start_time;
  const rawTakes = takes.filter((t) => t.raw_audio_url);
  const syntheses = takes.filter((t) => t.converted_audio_url);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Original audio row */}
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--studio-elevated)" }}>
        {line.original_audio_url && <AudioBtn url={line.original_audio_url} label="Original" />}
        <span className="text-[12px] tabular-nums" style={{ color: "var(--studio-text-muted)" }}>{dur.toFixed(1)}s</span>
        <div className="flex-1"><WaveformBar id={line.id} color={color} count={40} /></div>
      </div>

      {/* Takes waveform rows */}
      {rawTakes.map((take) => (
        <div key={take.id} className="flex items-center gap-3 p-3 rounded-xl"
          style={{
            backgroundColor: take.approved ? "rgba(60,203,127,0.06)" : "var(--studio-surface)",
            border: take.approved ? "1px solid rgba(60,203,127,0.25)" : "1px solid var(--studio-border)",
          }}>
          {take.raw_audio_url && <AudioBtn url={take.raw_audio_url} label={`Take ${take.take_number}`} />}
          {take.converted_audio_url && <AudioBtn url={take.converted_audio_url} label="Synth" />}
          <div className="flex-1"><WaveformBar id={take.id} color={take.converted_audio_url ? "#F59E0B" : color} count={40} /></div>
          {take.status === "converting" && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--studio-warning)" }} />}
          {take.status === "done" && !take.approved && (
            <button onClick={() => handleApprove(take.id, false)}
              className="text-[11px] px-2 py-1 rounded hover:opacity-80" style={{ color: "var(--studio-active)" }}>
              Select
            </button>
          )}
          {take.approved && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
              style={{ backgroundColor: "rgba(60,203,127,0.15)", color: "var(--studio-success)" }}>
              <CheckCircle2 className="w-3 h-3" /> Selected
            </span>
          )}
        </div>
      ))}

      {/* Record + Synthesize section */}
      <div className="grid grid-cols-2 gap-3">
        {/* Takes column */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--studio-text-muted)" }}>
            Takes ({rawTakes.length})
          </div>
          <button
            onClick={recorder.recording ? recorder.stop : recorder.start}
            className="w-full py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{
              backgroundColor: recorder.recording ? "var(--studio-error)" : "#EF4444",
              color: "#fff",
            }}>
            {recorder.recording ? <><Square className="w-3.5 h-3.5" /> Stop Recording</> :
              <><Mic className="w-3.5 h-3.5" /> Record Take</>}
          </button>
          {rawTakes.map((take) => (
            <div key={take.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
              style={{ backgroundColor: "var(--studio-elevated)" }}>
              <span style={{ color: "var(--studio-text-primary)" }}>Take {take.take_number}</span>
              <span style={{ color: "var(--studio-text-muted)" }}>{take.recording_source}</span>
            </div>
          ))}
        </div>

        {/* Syntheses column */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--studio-text-muted)" }}>
            Syntheses ({syntheses.length})
          </div>
          {rawTakes.length > 0 && (
            <button
              onClick={() => {
                const latestRaw = rawTakes[rawTakes.length - 1];
                if (latestRaw && latestRaw.status !== "converting") handleSynthesize(latestRaw.id);
              }}
              disabled={!actor?.elevenlabs_voice_id || rawTakes.some((t) => t.status === "converting")}
              className="w-full py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
              <Sparkles className="w-3.5 h-3.5" /> Synthesize
            </button>
          )}
          {syntheses.map((synth) => (
            <div key={synth.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
              style={{
                backgroundColor: synth.approved ? "rgba(60,203,127,0.08)" : "var(--studio-elevated)",
                border: synth.approved ? "1px solid rgba(60,203,127,0.2)" : "none",
              }}>
              <span style={{ color: "var(--studio-text-primary)" }}>Synthesis {synth.take_number}</span>
              <div className="flex items-center gap-2">
                {synth.approved && <CheckCircle2 className="w-3 h-3" style={{ color: "var(--studio-success)" }} />}
                <button onClick={() => handleApprove(synth.id, synth.approved)}
                  className="text-[11px] hover:underline"
                  style={{ color: synth.approved ? "var(--studio-success)" : "var(--studio-active)" }}>
                  {synth.approved ? "Selected" : "Select"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DubStudio
// ---------------------------------------------------------------------------
export function DubStudio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = useStudioStore((s) => s.sessionId);
  const session = useStudioStore((s) => s.session);
  const activeLineId = useStudioStore((s) => s.activeDialogueLineId);
  const setActiveLineId = useStudioStore((s) => s.setActiveDialogueLineId);

  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderDone, setRenderDone] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);

  // Voice settings
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [pitch, setPitch] = useState(0);

  const videoUrl = session?.video_path ? `${BASE}/api/upload/files/${session.video_path}` : null;

  const { data: actors = [] } = useQuery<ActorOut[]>({
    queryKey: ["actors", sessionId],
    queryFn: () => api.voiceLab.listActors(sessionId!),
    enabled: !!sessionId,
  });

  const { data: lines = [] } = useQuery<DialogueLineOut[]>({
    queryKey: ["dub-lines", sessionId],
    queryFn: () => api.dubStudio.listLines(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  });

  // Auto-select first line
  useEffect(() => {
    if (lines.length > 0 && !activeLineId) {
      setActiveLineId(lines[0].id);
    }
  }, [lines, activeLineId, setActiveLineId]);

  const activeLine = lines.find((l) => l.id === activeLineId);
  const activeActor = activeLine ? actors.find((a) => a.id === activeLine.actor_id) : null;
  const activeActorIdx = activeActor ? actors.findIndex((a) => a.id === activeActor.id) : -1;

  // Seek video when selecting a line
  const handleSelectLine = (line: DialogueLineOut) => {
    setActiveLineId(line.id);
    setSeekTime(line.start_time);
  };

  // Render SSE
  useEffect(() => {
    if (!renderJobId || !sessionId) return;
    const url = api.dubStudio.jobEventsUrl(sessionId, renderJobId);
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        setRenderProgress(ev.progress);
        if (ev.status === "done") { setRenderDone(true); es.close(); }
        if (ev.status === "failed") { toast.error(ev.error || "Render failed"); es.close(); }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [renderJobId, sessionId]);

  const handleStartRender = async () => {
    if (!sessionId) return;
    try {
      const { job_id } = await api.dubStudio.startRender(sessionId);
      setRenderJobId(job_id);
      setRenderProgress(0);
      setRenderDone(false);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Render failed"); }
  };

  const approvedCount = lines.filter((l) => l.selected_take_id).length;

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--studio-bg)" }}>
        <FloatingNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px]" style={{ color: "var(--studio-text-muted)" }}>
            No session active. <button onClick={() => navigate("/")} className="underline">Upload a video first</button>.
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
        <span className="text-[13px] font-medium" style={{ color: "var(--studio-text-primary)" }}>Dub Studio</span>
        <span className="text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
          {approvedCount}/{lines.length} approved
        </span>
      </div>

      {/* 3-column body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Column 1: Dialogue Lines sidebar */}
        <div className="w-[240px] border-r flex flex-col shrink-0"
          style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}>
          <div className="px-4 py-3 text-[11px] uppercase tracking-wider shrink-0"
            style={{ color: "var(--studio-text-muted)" }}>Dialogue Lines</div>
          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
                No dialogue lines found. Re-extract to enable.
              </div>
            )}
            {lines.map((line) => {
              const actor = actors.find((a) => a.id === line.actor_id);
              const idx = actors.findIndex((a) => a.id === line.actor_id);
              const c = idx >= 0 ? SPEAKER_COLORS[idx % SPEAKER_COLORS.length] : "#666";
              const isActive = line.id === activeLineId;
              return (
                <button key={line.id}
                  onClick={() => handleSelectLine(line)}
                  className="w-full text-left px-3 py-2.5 transition-colors hover:bg-white/5"
                  style={{
                    backgroundColor: isActive ? "var(--studio-elevated)" : "transparent",
                    borderLeft: `3px solid ${isActive ? c : "transparent"}`,
                  }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-[12px] font-medium truncate" style={{ color: "var(--studio-text-primary)" }}>
                      {actor?.label || "Unknown"}
                    </span>
                    {line.selected_take_id && <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: "var(--studio-success)" }} />}
                  </div>
                  <div className="text-[11px] truncate pl-4" style={{ color: "var(--studio-text-muted)" }}>
                    {line.transcript_text || "[No transcript]"}
                  </div>
                  <div className="text-[10px] pl-4 mt-0.5 flex items-center gap-2" style={{ color: "var(--studio-text-muted)" }}>
                    <span>{fmt(line.start_time)}</span>
                    {line.takes_count > 0 && <span>{line.takes_count} take{line.takes_count !== 1 ? "s" : ""}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Video + Work area */}
        <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: "var(--studio-border)" }}>
          {videoUrl ? (
            <VideoPlayer url={videoUrl} seekTime={seekTime} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ backgroundColor: "#000" }}>
              <Film className="w-10 h-10" style={{ color: "var(--studio-text-muted)" }} />
              <span className="text-[13px]" style={{ color: "var(--studio-text-muted)" }}>No video source</span>
            </div>
          )}

          {/* Takes/Synthesis work area */}
          {activeLine ? (
            <LineWorkArea line={activeLine} actors={actors} sessionId={sessionId} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[13px]" style={{ color: "var(--studio-text-muted)" }}>Select a dialogue line to start dubbing</span>
            </div>
          )}
        </div>

        {/* Column 3: Voice Settings */}
        <div className="w-[280px] flex flex-col shrink-0 overflow-y-auto p-5"
          style={{ backgroundColor: "var(--studio-surface)" }}>
          {activeActor && (
            <>
              <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: "var(--studio-border)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold"
                  style={{
                    backgroundColor: `${SPEAKER_COLORS[activeActorIdx % SPEAKER_COLORS.length]}20`,
                    color: SPEAKER_COLORS[activeActorIdx % SPEAKER_COLORS.length],
                  }}>
                  S{activeActorIdx + 1}
                </div>
                <div>
                  <div className="text-[14px] font-medium" style={{ color: "var(--studio-text-primary)" }}>{activeActor.label}</div>
                  <div className="text-[11px]" style={{ color: activeActor.elevenlabs_voice_id ? "var(--studio-success)" : "var(--studio-warning)" }}>
                    {activeActor.elevenlabs_voice_id ? "Voice cloned ✓" : "Not cloned"}
                  </div>
                </div>
              </div>

              {activeLine && (
                <div className="mb-5 p-3 rounded-lg" style={{ backgroundColor: "var(--studio-elevated)" }}>
                  <div className="text-[12px] mb-1" style={{ color: "var(--studio-text-primary)" }}>
                    {activeLine.transcript_text || "[No transcript]"}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--studio-text-muted)" }}>
                    {fmt(activeLine.start_time)} - {fmt(activeLine.end_time)} ({(activeLine.end_time - activeLine.start_time).toFixed(1)}s)
                  </div>
                </div>
              )}

              <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: "var(--studio-text-muted)" }}>
                Voice Settings
              </div>
              <div className="space-y-4">
                <Slider label="Stability" min={0} max={1} step={0.05} value={stability}
                  onChange={setStability} format={(v) => v.toFixed(2)} />
                <Slider label="Similarity" min={0} max={1} step={0.05} value={similarity}
                  onChange={setSimilarity} format={(v) => v.toFixed(2)} />
                <Slider label="Pitch shift" min={-6} max={6} step={0.5} value={pitch}
                  onChange={setPitch} format={(v) => `${v > 0 ? "+" : ""}${v} st`} />
              </div>
            </>
          )}

          {!activeActor && (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[13px]" style={{ color: "var(--studio-text-muted)" }}>Select a dialogue line</span>
            </div>
          )}
        </div>
      </div>

      {/* Export bar */}
      <div className="border-t p-4 flex items-center gap-4 shrink-0"
        style={{ backgroundColor: "var(--studio-surface)", borderColor: "var(--studio-border)" }}>
        {renderJobId && !renderDone ? (
          <div className="flex items-center gap-3 flex-1">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "var(--studio-active)" }} />
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--studio-elevated)" }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${renderProgress}%`, backgroundColor: "var(--studio-active)" }} />
            </div>
            <span className="text-[12px] shrink-0 tabular-nums" style={{ color: "var(--studio-text-muted)" }}>{renderProgress}%</span>
          </div>
        ) : renderDone ? (
          <div className="flex items-center gap-3 flex-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--studio-success)" }} />
            <span className="text-[13px] flex-1" style={{ color: "var(--studio-success)" }}>Export complete</span>
            <a href={api.dubStudio.downloadUrl(sessionId, renderJobId!)} download
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] hover:opacity-80"
              style={{ backgroundColor: "var(--studio-success)", color: "#fff" }}>
              <Download className="w-4 h-4" /> Download .mp4
            </a>
          </div>
        ) : (
          <>
            <div className="flex-1 text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
              {approvedCount === 0
                ? "Record takes and approve syntheses to export"
                : `${approvedCount} line${approvedCount !== 1 ? "s" : ""} approved — ready to export`}
            </div>
            <button onClick={handleStartRender} disabled={approvedCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--studio-active)", color: "#fff" }}>
              Export Final Video
            </button>
          </>
        )}
      </div>
    </div>
  );
}
