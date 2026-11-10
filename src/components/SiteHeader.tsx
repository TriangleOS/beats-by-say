import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/studio", label: "Studio" },
  { to: "/songwriter", label: "Songwriter" },
  { to: "/mastering", label: "SayMaster" },
  { to: "/roadmap", label: "Roadmap" },
] as const;

export function SiteHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Beats by Say home" className="shrink-0">
          <img src={logoIcon} alt="Beats by Say" className="h-9 w-9" />
        </Link>
        <nav className="hidden items-center gap-6 text-xs font-bold text-muted-foreground md:flex" aria-label="Main navigation">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="transition-colors hover:text-foreground [&.active]:text-primary">
              {item.label}
            </Link>
          ))}
          {user && (
            <Link to="/dashboard" className="transition-colors hover:text-foreground [&.active]:text-primary">
              My beats
            </Link>
          )}
        </nav>
        {user ? (
          <button type="button" onClick={() => void signOut()} className="ml-auto text-xs font-bold text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        ) : (
          <Link to="/login" className="ml-auto text-xs font-bold text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
        )}
        <Link to="/studio" className="inline-flex h-9 items-center gap-2 rounded-sm bg-primary px-4 text-xs font-extrabold text-primary-foreground transition-opacity hover:opacity-90">
          Open Studio <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-border px-4 py-2 text-xs font-bold text-muted-foreground md:hidden" aria-label="Main navigation">
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} className="[&.active]:text-primary">{item.label}</Link>
        ))}
        {user && <Link to="/dashboard" className="[&.active]:text-primary">My beats</Link>}
      </nav>
    </header>
  );
}
