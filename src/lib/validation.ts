import { z } from "zod";

// Auth validation
export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

export const signupSchema = loginSchema.extend({
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(30, "Username must be under 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

// Upload validation
export const SPORT_OPTIONS = [
  "Football", "Basketball", "Soccer", "Baseball", "Hockey", "Volleyball", "Track & Field", "Other",
] as const;

export const uploadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100, "Title must be under 100 characters"),
  caption: z.string().trim().max(200, "Caption must be under 200 characters").optional(),
  section: z.string().trim().max(50, "Section must be under 50 characters").optional(),
  game: z.string().trim().max(50, "Game must be under 50 characters").optional(),
  sport: z.string().trim().max(50).optional(),
  schoolTeam: z.string().trim().max(100, "Team name must be under 100 characters").optional(),
  location: z.string().trim().max(100, "Location must be under 100 characters").optional(),
});

// Comment validation
export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(500, "Comment must be under 500 characters"),
});

// Profile validation
export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(30, "Username must be under 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
  team: z.string().trim().max(50).optional(),
  section: z.string().trim().max(50).optional(),
});

// File validation
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

export function validateVideoFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File too large. Maximum size is 50MB.";
  }
  if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return "Unsupported format. Use MP4, MOV, or WebM.";
  }
  return null;
}
