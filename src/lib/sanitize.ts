export function sanitizeSearchTerm(input: string, maxLength = 40): string {
  const trimmed = input.trim().slice(0, maxLength);
  return trimmed.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ");
}
