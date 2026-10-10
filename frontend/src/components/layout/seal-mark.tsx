/**
 * "Le Sceau" — Cachetify's reduced mark, reproduced at the exact geometry and colors from
 * the concept artifact (circle r=100 on a 240 viewBox, 12-dot pearled border at r=84, ring
 * r=54/stroke-width=22 cut open on the right, closed by a seal-flourish dot). Shared by every
 * place the mark+wordmark lockup appears (sidebar, landing header) so they stay pixel-identical
 * instead of drifting apart as separately-maintained copies.
 */
export function SealMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="120" cy="120" r="100" fill="#FFC107" />
      <circle cx="204" cy="120" r="5" fill="#15180F" /><circle cx="192.7" cy="162" r="5" fill="#15180F" />
      <circle cx="162" cy="192.7" r="5" fill="#15180F" /><circle cx="120" cy="204" r="5" fill="#15180F" />
      <circle cx="78" cy="192.7" r="5" fill="#15180F" /><circle cx="47.3" cy="162" r="5" fill="#15180F" />
      <circle cx="36" cy="120" r="5" fill="#15180F" /><circle cx="47.3" cy="78" r="5" fill="#15180F" />
      <circle cx="78" cy="47.3" r="5" fill="#15180F" /><circle cx="120" cy="36" r="5" fill="#15180F" />
      <circle cx="162" cy="47.3" r="5" fill="#15180F" /><circle cx="192.7" cy="78" r="5" fill="#15180F" />
      <circle cx="120" cy="120" r="54" fill="none" stroke="#15180F" strokeWidth="22" />
      <rect x="110" y="75" width="95" height="90" fill="#FFC107" />
      <circle cx="178" cy="155" r="8" fill="#15180F" />
    </svg>
  );
}
