export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex min-h-full flex-1 items-center justify-center p-4">
      {children}
    </div>
  );
}
