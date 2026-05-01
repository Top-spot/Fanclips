import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Send, Loader2, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { MAX_COMMENTARY_DURATION_SEC, RECORDING_UI_MAX_SEC } from "@/lib/clipCommentary/constants";
import { publishClipCommentary } from "@/services/clipCommentaryService";
import { useToast } from "@/hooks/use-toast";

type Phase = "mic" | "idle" | "recording" | "review" | "publishing";

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

type Props = {
  clipId: string;
  clipTitle: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  currentUserId: string;
  onPublished: (featureId: string) => void;
  onCancel: () => void;
};

export function CommentaryRecordingStudio({
  clipId,
  clipTitle,
  videoUrl,
  thumbnailUrl,
  currentUserId,
  onPublished,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("mic");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [title, setTitle] = useState("");
  const [videoMuted, setVideoMuted] = useState(true);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const youtubeEmbedUrl = getYouTubeEmbedUrl(videoUrl);
  const effectiveMaxSec = Math.min(MAX_COMMENTARY_DURATION_SEC, RECORDING_UI_MAX_SEC);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      cleanupStream();
      if (recordedUrl?.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
    };
  }, [cleanupStream, recordedUrl]);

  const requestMic = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      setPhase("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microphone access denied";
      setMicError(msg);
      toast({ title: "Microphone needed", description: msg, variant: "destructive" });
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;

    if (recordedUrl?.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    chunksRef.current = [];
    setElapsedSec(0);

    const mime = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorder.onstop = () => {
      stopTimer();
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size < 200) {
        toast({ title: "Recording too short", description: "Hold record for at least a second.", variant: "destructive" });
        setPhase("idle");
        return;
      }
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      setPhase("review");
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setPhase("recording");

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      setElapsedSec(sec);
      if (sec >= effectiveMaxSec) {
        recorder.stop();
        toast({ title: "Max length reached", description: `Saved first ${effectiveMaxSec} seconds.` });
      }
    }, 200);

    const v = videoRef.current;
    if (v && videoUrl && !youtubeEmbedUrl) {
      void v.play().catch(() => {
        void 0;
      });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    const v = videoRef.current;
    if (v) {
      v.pause();
    }
  };

  const discardRecording = () => {
    if (recordedUrl?.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsedSec(0);
    setPhase("idle");
  };

  const togglePreviewPlayback = () => {
    const a = previewAudioRef.current;
    if (!a) return;
    if (previewPlaying) {
      a.pause();
      setPreviewPlaying(false);
    } else {
      void a.play();
      setPreviewPlaying(true);
    }
  };

  useEffect(() => {
    const a = previewAudioRef.current;
    if (!a) return;
    const onEnded = () => setPreviewPlaying(false);
    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [recordedUrl]);

  const handlePublish = async () => {
    if (!recordedBlob) return;
    const featureId = crypto.randomUUID();
    setPhase("publishing");
    const result = await publishClipCommentary({
      featureId,
      sourceClipId: clipId,
      creatorUserId: currentUserId,
      audioBlob: recordedBlob,
      durationSeconds: Math.round(elapsedSec * 10) / 10,
      title: title.trim() || null,
    });
    if (result.error || !result.data) {
      toast({
        title: "Could not publish reaction",
        description: result.error ?? "Try again after migrations are applied.",
        variant: "destructive",
      });
      setPhase("review");
      return;
    }
    toast({ title: "Reaction published", description: "It appears on your profile under Reactions." });
    onPublished(featureId);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl overflow-hidden border border-border bg-black aspect-video relative">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title={clipTitle}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            playsInline
            controls={phase !== "recording"}
            muted={videoMuted || phase === "recording"}
          />
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No video</div>
        )}
        {phase === "recording" && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-xl bg-background/90 border border-border px-3 py-2">
            <span className="flex items-center gap-2 text-destructive font-bold text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" />
              REC {formatTime(elapsedSec)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">max {formatTime(effectiveMaxSec)}</span>
          </div>
        )}
      </div>

      {!youtubeEmbedUrl && videoUrl && phase !== "recording" && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Video sound while rehearsing</p>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setVideoMuted((m) => !m)}>
            {videoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {youtubeEmbedUrl && (
        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/50 border border-border/60 px-3 py-2">
          YouTube clip: play the video manually while you record — your voice is captured on the timeline you choose. For automatic sync on replay, uploaded clips work best.
        </p>
      )}

      {phase === "mic" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Allow the microphone to record your live reaction.</p>
          {micError && <p className="text-xs text-destructive">{micError}</p>}
          <Button type="button" className="w-full" onClick={() => void requestMic()}>
            <Mic className="w-4 h-4 mr-2" />
            Enable microphone
          </Button>
        </div>
      )}

      {phase === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Watch the play, then tap record and react like a commentator.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="w-full" onClick={startRecording}>
              <Mic className="w-4 h-4 mr-2" />
              Record
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {phase === "recording" && (
        <Button type="button" variant="destructive" className="w-full" onClick={stopRecording}>
          <Square className="w-4 h-4 mr-2" />
          Stop
        </Button>
      )}

      {phase === "review" && recordedUrl && (
        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold text-foreground">Preview your reaction</p>
          <audio ref={previewAudioRef} src={recordedUrl} className="w-full" controls />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={togglePreviewPlayback}>
              {previewPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              {previewPlaying ? "Pause" : "Play"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={discardRecording}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Re-record
            </Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="commentary-title">
              Optional title
            </label>
            <Input
              id="commentary-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Final second call"
              maxLength={80}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Exit
            </Button>
            <Button type="button" onClick={() => void handlePublish()} disabled={!recordedBlob}>
              <Send className="w-4 h-4 mr-2" />
              Publish
            </Button>
          </div>
        </div>
      )}

      {phase === "publishing" && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Publishing…
        </div>
      )}
    </div>
  );
}
