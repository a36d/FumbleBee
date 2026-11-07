import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function MetricCard({ label, value, change, changeLabel, icon: Icon, tone }: {
  label: string; value: string; change: string; changeLabel: string; icon: LucideIcon; tone: string;
}) {
  return (
    <section className="metric-card">
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot"><span className="metric-change"><ArrowUpRight size={13} />{change}</span><span>{changeLabel}</span></div>
    </section>
  );
}
