export function escapeSubmittedText(
  value: string | number | null | undefined
): string {
  if (value == null) return '';
  return String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeOptionalSubmittedText(
  value: string | null | undefined
): string | null | undefined {
  if (value == null) return value;
  return escapeSubmittedText(value);
}
