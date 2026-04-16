export function formatPaisa(paisa: number): string {
  return `₹${(paisa / 100).toFixed(2)}`;
}
