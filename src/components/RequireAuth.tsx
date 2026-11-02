import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    setChecked(true);
  }, [user, loading, navigate]);

  if (!checked) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-32 text-center text-muted-foreground">Loading…</div>
    );
  }
  return <>{children}</>;
}
