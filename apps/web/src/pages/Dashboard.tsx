import AppShell from '../components/AppShell';

export default function Dashboard() {
  return (
    <AppShell>
      <h1
        className="font-semibold text-2xl text-[#0F172A] tracking-[-0.01em] mb-3"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        You're all set up
      </h1>
      <p className="text-base text-[#94A3B8]">
        Upload and Match are coming shortly — check back once you're ready to transfer dead stock.
      </p>
    </AppShell>
  );
}
