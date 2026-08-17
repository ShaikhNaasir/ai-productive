// Company branding + copyright. Rendered on the auth pages and the dashboard footer.
export default function BrandFooter({ className = '' }) {
  const year = new Date().getFullYear();
  return (
    <p className={className}>
      © {year}{' '}
      <a
        href="https://naze.in"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline-offset-2 hover:underline"
      >
        Naze Technology
      </a>
      . All rights reserved.
    </p>
  );
}
