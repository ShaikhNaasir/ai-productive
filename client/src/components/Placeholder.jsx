import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Placeholder({ title, children }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {children || 'Coming soon.'}
        </CardContent>
      </Card>
    </div>
  );
}
