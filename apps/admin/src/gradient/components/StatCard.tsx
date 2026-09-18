type StatCardProps = {
  label: string;
  value: string;
  change: string;
  up: boolean;
  dotColor: string;
};

export default function StatCard({ label, value, change, up, dotColor }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent hover:-translate-y-0.5 transition-all duration-200 cursor-default group">
      <div
        className="w-2 h-2 rounded-full mb-3"
        style={{ background: dotColor }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
        {label}
      </p>
      <p className="font-display font-bold text-3xl text-slate-100 tracking-tight mb-2">
        {value}
      </p>
      <span
        className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-full
          ${up
            ? "text-brand-success bg-brand-success/10"
            : "text-brand-danger bg-brand-danger/10"
          }`}
      >
        {up ? "▲" : "▼"} {change}
      </span>
    </div>
  );
}