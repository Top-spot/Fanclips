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
export const uploadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100, "Title must be under 100 characters"),
  caption: z.string().trim().max(200, "Caption must be under 200 characters").optional(),
  section: z.string().trim().max(50, "Section must be under 50 characters").optional(),
  game: z.string().trim().max(50, "Game must be under 50 characters").optional(),
});

// Comment validation
export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(500, "Comment must be under 500 characters"),
});

export const commentIdSchema = z.string().uuid("Invalid comment target");

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
  bio: z
    .string()
    .trim()
    .max(180, "About must be under 180 characters")
    .refine((value) => (value ? value.split(/\s+/).filter(Boolean).length <= 30 : true), "About must be 30 words or less")
    .optional(),
});

export const adminRewardRuleSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, "Label is required").max(80, "Label must be under 80 characters"),
  description: z.string().trim().max(280, "Description must be under 280 characters").nullable(),
  points_value: z
    .number()
    .int("Points must be a whole number")
    .min(0, "Points cannot be negative")
    .max(100000, "Points value is too large"),
  enabled: z.boolean(),
});

export const rewardMutationSchema = z.object({
  name: z.string().trim().min(1, "Reward name is required").max(80, "Reward name must be under 80 characters"),
  description: z.string().trim().max(280, "Description must be under 280 characters").nullable(),
  points_cost: z
    .number()
    .int("Points cost must be a whole number")
    .min(1, "Points cost must be at least 1")
    .max(1000000, "Points cost is too large"),
  category: z
    .string()
    .trim()
    .min(1, "Category is required")
    .max(32, "Category must be under 32 characters")
    .regex(/^[a-zA-Z0-9_\s-]+$/, "Use letters, numbers, spaces, underscores, or dashes"),
  active: z.boolean(),
});

export const rewardTransferSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number")
    .min(1, "Amount must be at least 1")
    .max(100000, "Amount is too large"),
  note: z.string().trim().max(80, "Note must be 80 characters or less"),
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
