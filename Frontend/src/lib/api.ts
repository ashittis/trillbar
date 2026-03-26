/**
 * TrillBar API client — typed fetch wrappers.
 */
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionOut {
  id: string;
  name: string;
  source_language: string;
  target_language: string;
  video_path: string | null;
  audio_path: string | null;
  status: string;
}

export interface ActorOut {
  id: string;
  session_id: string;
  label: string;
  sample_audio_url: string | null;
  cleaned_audio_url: string | null;
  elevenlabs_voice_id: string | null;
  cloning_status: string; // pending | processing | ready | failed
  cloning_error: string | null;
  order: number;
  samples_count: number;
}

export interface DialogueLineOut {
  id: string;
  session_id: string;
  actor_id: string | null;
  actor_label: string | null;
  transcript_text: string | null;
  start_time: number;
  end_time: number;
  order: number;
  original_audio_url: string | null;
  takes_count: number;
  selected_take_id: string | null;
}

export interface TakeOut {
  id: string;
  dialogue_line_id: string | null;
  actor_id: string;
  actor_label: string | null;
  take_number: number;
  recording_source: string;
  raw_audio_url: string | null;
  converted_audio_url: string | null;
  stability: number;
  similarity_boost: number;
  pitch_shift: number;
  status: string; // pending | converting | done | failed
  error: string | null;
  approved: boolean;
}

export interface DubTrackOut {
  id: string;
  session_id: string;
  actor_id: string;
  actor_label: string | null;
  raw_audio_url: string | null;
  converted_audio_url: string | null;
  stability: number;
  similarity_boost: number;
  pitch_shift: number;
  status: string; // pending | converting | done | failed
  error: string | null;
  approved: boolean;
}

export interface CleanSettings {
  highpass: boolean;
  hp_freq: number;
  denoise: boolean;
  noise_floor: number;
  bass: number;
  treble: number;
  normalize: boolean;
}

export interface JobOut {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const api = {
  // Sessions CRUD
  sessions: {
    create: (body: { name: string; source_language: string; target_language: string }) =>
      request<SessionOut>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => request<SessionOut>(`/api/sessions/${id}`),
    list: () => request<SessionOut[]>("/api/sessions"),
    update: (id: string, body: Partial<Pick<SessionOut, "name" | "source_language" | "target_language">>) =>
      request<SessionOut>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
    languages: () => request<{ source: Record<string, string>; target: Record<string, string> }>("/api/sessions/languages"),
  },

  // Video upload with XHR progress
  upload: {
    video: (sessionId: string, file: File, onProgress?: (pct: number) => void) =>
      new Promise<SessionOut>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE}/api/upload/video`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        const fd = new FormData();
        fd.append("file", file);
        fd.append("session_id", sessionId);
        xhr.send(fd);
      }),
  },

  // Voice Lab
  voiceLab: {
    startExtraction: (sessionId: string) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/voice-lab/start`, { method: "POST" }),

    listActors: (sessionId: string) =>
      request<ActorOut[]>(`/api/sessions/${sessionId}/voice-lab/actors`),

    updateActor: (sessionId: string, actorId: string, label: string) =>
      request<ActorOut>(`/api/sessions/${sessionId}/voice-lab/actors/${actorId}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      }),

    listActorSamples: (sessionId: string, actorId: string) =>
      request<DialogueLineOut[]>(`/api/sessions/${sessionId}/voice-lab/actors/${actorId}/samples`),

    cleanPreview: (sessionId: string, actorId: string, settings: CleanSettings) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/voice-lab/actors/${actorId}/clean-preview`, {
        method: "POST",
        body: JSON.stringify(settings),
      }),

    cleanApply: (sessionId: string, actorId: string, settings: CleanSettings) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/voice-lab/actors/${actorId}/clean-apply`, {
        method: "POST",
        body: JSON.stringify(settings),
      }),

    cloneActor: (sessionId: string, actorId: string, selectedLineIds?: string[]) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/voice-lab/actors/${actorId}/clone`, {
        method: "POST",
        body: JSON.stringify({ selected_line_ids: selectedLineIds ?? null }),
      }),

    cloneAll: (sessionId: string) =>
      request<{ job_ids: string[] }>(`/api/sessions/${sessionId}/voice-lab/clone-all`, { method: "POST" }),

    jobEventsUrl: (sessionId: string, jobId: string) =>
      `${BASE}/api/sessions/${sessionId}/voice-lab/jobs/${jobId}/events`,

    listJobs: (sessionId: string) =>
      request<JobOut[]>(`/api/sessions/${sessionId}/voice-lab/jobs`),
  },

  // Dub Studio
  dubStudio: {
    // Dialogue line endpoints
    listLines: (sessionId: string) =>
      request<DialogueLineOut[]>(`/api/sessions/${sessionId}/dub-studio/lines`),

    listLineTakes: (sessionId: string, lineId: string) =>
      request<TakeOut[]>(`/api/sessions/${sessionId}/dub-studio/lines/${lineId}/takes`),

    uploadTake: (sessionId: string, lineId: string, file: File | Blob) => {
      const fd = new FormData();
      fd.append("file", file, file instanceof File ? file.name : "recording.webm");
      return fetch(`${BASE}/api/sessions/${sessionId}/dub-studio/lines/${lineId}/takes`, {
        method: "POST",
        body: fd,
      }).then((r) => {
        if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
        return r.json() as Promise<TakeOut>;
      });
    },

    recordTake: (sessionId: string, lineId: string, blob: Blob) => {
      const fd = new FormData();
      fd.append("file", blob, "recording.webm");
      return fetch(`${BASE}/api/sessions/${sessionId}/dub-studio/lines/${lineId}/record`, {
        method: "POST",
        body: fd,
      }).then((r) => {
        if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
        return r.json() as Promise<TakeOut>;
      });
    },

    synthesizeTake: (sessionId: string, takeId: string) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/dub-studio/takes/${takeId}/synthesize`, { method: "POST" }),

    updateTake: (sessionId: string, takeId: string, body: Partial<Pick<TakeOut, "stability" | "similarity_boost" | "pitch_shift" | "approved">>) =>
      request<TakeOut>(`/api/sessions/${sessionId}/dub-studio/takes/${takeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    // Legacy per-actor endpoints
    uploadTrack: (sessionId: string, actorId: string, file: File) => {
      const fd = new FormData();
      fd.append("actor_id", actorId);
      fd.append("file", file);
      return fetch(`${BASE}/api/sessions/${sessionId}/dub-studio/tracks`, {
        method: "POST",
        body: fd,
      }).then((r) => {
        if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
        return r.json() as Promise<DubTrackOut>;
      });
    },

    listTracks: (sessionId: string) =>
      request<DubTrackOut[]>(`/api/sessions/${sessionId}/dub-studio/tracks`),

    updateTrack: (sessionId: string, trackId: string, body: Partial<Pick<DubTrackOut, "stability" | "similarity_boost" | "pitch_shift" | "approved">>) =>
      request<DubTrackOut>(`/api/sessions/${sessionId}/dub-studio/tracks/${trackId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    convertTrack: (sessionId: string, trackId: string) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/dub-studio/tracks/${trackId}/convert`, { method: "POST" }),

    startRender: (sessionId: string) =>
      request<{ job_id: string }>(`/api/sessions/${sessionId}/dub-studio/render`, { method: "POST" }),

    jobEventsUrl: (sessionId: string, jobId: string) =>
      `${BASE}/api/sessions/${sessionId}/dub-studio/jobs/${jobId}/events`,

    downloadUrl: (sessionId: string, jobId: string) =>
      `${BASE}/api/sessions/${sessionId}/dub-studio/download/${jobId}`,
  },

  // File serving helper
  fileUrl: (relPath: string) => `${BASE}${relPath}`,
};
