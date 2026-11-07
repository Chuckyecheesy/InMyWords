export function DataBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="banner" role="status">
      {children}
    </p>
  );
}
