import { createFileRoute } from "@tanstack/react-router";
import { ContactForm } from "@/components/ContactForm";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact | Beats by Say" },
      { name: "description", content: "Get in touch with the Beats by Say team." },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-2xl px-4 py-12 pb-24 sm:px-6">
      <p className="section-label">Contact</p>
      <h1 className="mt-2 text-4xl md:text-5xl">Talk to us</h1>
      <p className="mt-3 text-sm text-muted-foreground">Questions, feedback, or something not working? Send a message and we'll reply by email.</p>
      <div className="mt-8">
        <ContactForm topics={{ general: "General question", support: "Something isn't working", feedback: "Feature idea", privacy: "Privacy or my data" }} />
      </div>
    </div>
  ),
});
