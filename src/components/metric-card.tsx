export function MetricCard({ label, value, change, changeLabel }: {
  label: string; value: string; change: string; changeLabel: string;
}) {
  return (
    <section className="metric-card">
      <div className="metric-top"><span>{label}</span></div>
      <div className="metric-value">{value}</div>
      <div className={`metric-foot ${change.startsWith("-") ? "metric-negative" : ""}`}><span className="metric-change">{change}</span><span>{changeLabel}</span></div>
    </section>
  );
}
