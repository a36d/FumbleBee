export function MetricCard({ label, value }: {
  label: string; value: string;
}) {
  return (
    <section className="metric-card">
      <div className="metric-top"><span>{label}</span></div>
      <div className="metric-value">{value}</div>
    </section>
  );
}
