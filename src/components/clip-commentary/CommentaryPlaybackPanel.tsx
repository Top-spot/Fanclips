import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { getCommentaryAudioPublicUrl } from "@/services/clipCommentaryService";
import type { ClipCommentaryFeature } from "@/lib/clipCommentary/types";

type Props = {
  feature: ClipCommentaryFeature;
  videoUrl: string | null;
  onDismiss: () => void;
};

export function CommentaryPlaybackPanel({ feature, videoUrl, onDismiss }: Props) {
  const audioUrl = getCommentaryAudioPublicUrl(feature.audio_storage_path);
  const youtubeEmbedUrl = getYouTubeEmbedUrl(videoUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (youtubeEmbedUrl || !videoUrl) return;
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;
    const sync = () => {
      if (Math.abs(a.currentTime - v.currentTime) > 0.35) {
        a.currentTime = v.currentTime;
      }
    };
    v.addEventListener("timeupdate", sync);
    v.addEventListener("seeked", sync);
    return () => {
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("seeked", sync);
    };
  }, [youtubeEmbedUrl, videoUrl, audioUrl]);

  const playSynced = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!a) return;
    if (v && videoUrl && !youtubeEmbedUrl) {
      a.currentTime = v.currentTime;
      void v.play();
    }
    void a.play();
  };

  return (
    <div className="rounded-xl border border-electric/50 bg-gradient-to-br from-card to-secondary/30 p-3 space-y-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-electric uppercase tracking-wider">Live reaction</p>
          {feature.title ? (
            <p className="text-sm font-semibold text-foreground mt-0.5">{feature.title}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Your commentary track</p>
          )}
        </div>
        <button type="button" onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
          Dismiss
        </button>
      </div>

      {youtubeEmbedUrl ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          For YouTube clips, press play on the embed above when you want to line up with your reaction, then use the audio player below.
        </p>
      ) : videoUrl ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full rounded-lg bg-black max-h-44 object-contain"
            playsInline
            controls
            muted
          />
          <Button type="button" size="sm" variant="secondary" className="w-full h-9" onClick={() => void playSynced()}>
            <Play className="w-4 h-4 mr-2" />
            Play video + reaction in sync
          </Button>
        </div>
      ) : null}

      <audio ref={audioRef} src={audioUrl} controls className="w-full" />
      <p className="text-[10px] text-muted-foreground tabular-nums">
        {feature.duration_seconds > 0 ? `${feature.duration_seconds.toFixed(1)}s recorded` : "Reaction audio"}
      </p>
    </div>
  );
}
