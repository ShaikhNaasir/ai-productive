import { Card, CardContent } from '@/components/ui/card';

export default function StatCard({ label, value, accent }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${accent || ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
