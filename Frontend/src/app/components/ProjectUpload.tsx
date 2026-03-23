import { Upload, Film, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useStudioStore } from "../../lib/store";

export function ProjectUpload() {
  const navigate = useNavigate();
  const setSession = useStudioStore((s) => s.setSession);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const session = await api.sessions.create({
        name: file.name.replace(/\.[^/.]+$/, "") || "Untitled",
        source_language: "ja",
        target_language: "hi",
      });
      setSession(session);
      await api.upload.video(session.id, file, (pct) => setUploadProgress(pct));
      toast.success("Upload complete — heading to Voice Lab");
      navigate("/voice-lab");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await handleFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--studio-bg)" }}>
      {/* Top bar */}
      <div className="flex justify-end px-6 py-4">
        <button
          onClick={() => navigate("/projects")}
          className="text-[12px] hover:opacity-80 transition-opacity"
          style={{ color: "var(--studio-text-muted)" }}
        >
          Projects
        </button>
      </div>

      {/* Center content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl">

          {/* Branding */}
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold mb-3 tracking-tight" style={{ color: "#4ade80" }}>
              trillbar
            </h1>
            <p className="text-[15px] mb-2" style={{ color: "var(--studio-text-primary)" }}>
              Professional Audio/Video Dubbing & Emotion Editing
            </p>
            <div className="flex items-center justify-center gap-2 text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sound-Alike Voice Matching • Word-Level Emotion Control</span>
            </div>
          </div>

          {/* Drop zone */}
          <label
            className={`block border-2 border-dashed rounded-xl p-16 transition-all ${
              isUploading
                ? "cursor-not-allowed opacity-60"
                : isDragging
                ? "cursor-copy"
                : "cursor-pointer"
            }`}
            style={{
              backgroundColor: isDragging ? "rgba(76,141,255,0.04)" : "var(--studio-surface)",
              borderColor: isDragging ? "var(--studio-active)" : "var(--studio-border)",
            }}
            onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <div className="flex flex-col items-center justify-center">
              {isUploading ? (
                <>
                  <Film className="w-8 h-8 mb-4" style={{ color: "var(--studio-active)" }} />
                  <div className="text-[14px] mb-3 truncate max-w-xs" style={{ color: "var(--studio-text-primary)" }}>
                    {fileName}
                  </div>
                  <div className="w-48 h-1 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--studio-elevated)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress ?? 0}%`, backgroundColor: "var(--studio-active)" }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {uploadProgress === 100 ? "Processing..." : `${uploadProgress ?? 0}%`}
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 mb-5" style={{ color: "var(--studio-active)" }} />
                  <div className="text-[16px] font-medium mb-2" style={{ color: "var(--studio-text-primary)" }}>
                    Drop your video here
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--studio-text-muted)" }}>
                    or click to browse • MP4, MOV, AVI, MKV
                  </div>
                </>
              )}
            </div>
          </label>

        </div>
      </div>
    </div>
  );
}
