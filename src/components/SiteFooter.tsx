import { Link } from "@tanstack/react-router";
import logoWordmark from "@/assets/logo-wordmark.png";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background py-10 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center sm:px-6">
        <img src={logoWordmark} alt="beatsbysay" loading="lazy" className="h-8 w-auto opacity-90" />
        <nav className="flex flex-wrap justify-center gap-5" aria-label="Footer">
          <Link to="/studio" className="hover:text-foreground">Studio</Link>
          <Link to="/songwriter" className="hover:text-foreground">Songwriter</Link>
          <Link to="/roadmap" className="hover:text-foreground">Roadmap</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
        </nav>
        <p>Instrumentals only. The vocals are yours.</p>
        <p>
          © {new Date().getFullYear()} Beats by Say · Finsec Associates Limited, trading as TriangleOS ·{" "}
          <a href="https://triangleos.com" className="hover:text-foreground">Part of Triangle OS</a>
        </p>
      </div>
    </footer>
  );
}
