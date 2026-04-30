import { useState, useRef, useEffect } from "react";
import { Upload, Video, MapPin, Tag, CheckCircle, Zap, Lock, Trophy, School, Navigation } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { uploadSchema, validateVideoFile, SPORT_OPTIONS } from "@/lib/validation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  onDone: () => void;
}

export default function UploadPage({ onDone }: Props) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [section, setSection] = useState("");
  const [game, setGame] = useState("");
  const [sport, setSport] = useState("");
  const [schoolTeam, setSchoolTeam] = useState("");
  const [location, setLocation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Auth gate — require sign-in to upload
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Sign in to Upload</h2>
        <p className="text-muted-foreground mb-6 text-sm">Create an account to share highlights and earn points.</p>
        <Button onClick={() => navigate("/auth")} className="gradient-electric text-primary-foreground font-bold h-12 px-8 rounded-xl glow-blue">
          Sign In / Sign Up
        </Button>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const error = validateVideoFile(f);
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    // Revoke previous preview URL
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    

    setErrors({});
    const result = uploadSchema.safeParse({
      title,
      caption: caption || undefined,
      section: section || undefined,
      game: game || undefined,
      sport: sport || undefined,
      schoolTeam: schoolTeam || undefined,
      location: location || undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!file) {
      toast({ title: "Please select a video file", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const path = `${user.id}/${Date.now()}.${ext}`;
      
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 2, 90));
      }, 300);

      const { error: uploadError } = await supabase.storage
        .from("clips")
        .upload(path, file, { upsert: false });

      clearInterval(progressInterval);
      
      if (uploadError) throw uploadError;
      setUploadProgress(95);

      const { data: urlData } = supabase.storage.from("clips").getPublicUrl(path);
      const video_url = urlData.publicUrl;

      const insertData = {
        title: result.data.title,
        caption: result.data.caption || null,
        section_tag: result.data.section || null,
        game_tag: result.data.game || null,
        sport: result.data.sport || null,
        school_team: result.data.schoolTeam || null,
        location: result.data.location || null,
        video_url,
        status: "live" as const,
        user_id: user.id,
      };

      const { data: clip, error: insertError } = await supabase
        .from("clips")
        .insert(insertData as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // Trigger AI processing in background — fire and forget
      if (clip && session) {
        supabase.functions.invoke("process-clip-ai", {
          body: { clip_id: clip.id },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch((err) => console.error("AI processing invoke failed:", err));
      }

      // Award upload points — fire and forget with logging
      if (clip) {
        supabase.rpc("award_upload_points", { p_clip_id: clip.id })
          .then(({ error }) => { if (error) console.error("Points award failed:", error); });
      }

      setUploadProgress(100);
      setDone(true);
      setTimeout(() => { onDone(); }, 2500);
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-24 h-24 rounded-full gradient-electric flex items-center justify-center glow-blue mb-6 animate-scale-in">
          <CheckCircle className="w-12 h-12 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">Clip Uploaded! 🔥</h2>
        <p className="text-muted-foreground mb-2">AI is enhancing your highlight...</p>
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-2 mt-2">
          <Zap className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-primary text-sm font-semibold">+50 points earned!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-black text-foreground">Upload Clip</h1>
        <p className="text-sm text-muted-foreground">Share your highlight & earn <span className="text-primary font-bold">+50 pts</span></p>
      </div>

      <div className="px-4 space-y-5 pb-8">
        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden w-full max-h-[50vh] aspect-square ${
            file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 bg-secondary/30"
          }`}
        >
          <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" className="hidden" onChange={handleFileSelect} />
          {preview ? (
            <div className="relative w-full h-full">
              <video src={preview} className="w-full h-full object-cover" controls />
              {file && (
                <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Tap to select a clip</p>
                <p className="text-xs text-muted-foreground">Max 50MB · MP4, MOV, WebM</p>
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold text-sm">Title *</Label>
          <Input
            placeholder="Epic buzzer beater at Lincoln High!"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-base ${errors.title ? "border-destructive" : ""}`}
            maxLength={100}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>

        {/* Sport */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold text-sm flex items-center gap-1">
            <Trophy className="w-3 h-3 text-primary" /> Sport
          </Label>
          <Select value={sport} onValueChange={setSport}>
            <SelectTrigger className={`bg-secondary/50 border-border h-12 text-foreground ${errors.sport ? "border-destructive" : ""}`}>
              <SelectValue placeholder="Select a sport" />
            </SelectTrigger>
            <SelectContent>
              {SPORT_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Team / School */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold text-sm flex items-center gap-1">
            <School className="w-3 h-3 text-primary" /> Team / School
          </Label>
          <Input
            placeholder="e.g. Lincoln High, Duke Blue Devils"
            value={schoolTeam}
            onChange={(e) => setSchoolTeam(e.target.value)}
            className={`bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-base ${errors.schoolTeam ? "border-destructive" : ""}`}
            maxLength={100}
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold text-sm flex items-center gap-1">
            <Navigation className="w-3 h-3 text-primary" /> Location / Area
          </Label>
          <Input
            placeholder="e.g. Austin, TX"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-base"
            maxLength={100}
          />
        </div>

        {/* Caption */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold text-sm">Caption</Label>
          <Input
            placeholder="Describe the moment..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className={`bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-base ${errors.caption ? "border-destructive" : ""}`}
            maxLength={200}
          />
          {errors.caption && <p className="text-xs text-destructive">{errors.caption}</p>}
        </div>

        {/* Section & Game */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-foreground font-semibold text-sm flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary" /> Section
            </Label>
            <Input placeholder="Sec 114" value={section} onChange={(e) => setSection(e.target.value)}
              className="bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-sm" maxLength={50} />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground font-semibold text-sm flex items-center gap-1">
              <Tag className="w-3 h-3 text-primary" /> Match / Event
            </Label>
            <Input placeholder="vs. Eagles Q4" value={game} onChange={(e) => setGame(e.target.value)}
              className="bg-secondary/50 border-border h-12 text-foreground placeholder:text-muted-foreground text-sm" maxLength={50} />
          </div>
        </div>

        {/* AI note */}
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3">
          <Zap className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="text-primary font-semibold">AI Enhancement</span> — After upload, our AI will generate a branded title and caption automatically.
          </p>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div className="h-full gradient-electric rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={uploading || !title.trim() || !file}
          className="w-full h-14 text-base font-black gradient-electric text-primary-foreground border-0 glow-blue rounded-2xl"
        >
          {uploading ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Uploading… {uploadProgress}%
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload & Earn 50 Points
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
