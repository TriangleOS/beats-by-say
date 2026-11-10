import { Mic2, X } from "lucide-react";

type Props = {
  leads: File[];
  backs: File[];
  onLeads: (f: File[]) => void;
  onBacks: (f: File[]) => void;
};

const ACCEPT = "audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a";

function Picker({
  label,
  hint,
  files,
  onChange,
}: {
  label: string;
  hint: string;
  files: File[];
  onChange: (f: File[]) => void;
}) {
  return (
    <div className="border border-border bg-background p-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <Mic2 className="h-4 w-4 text-primary" /> {label}
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <span className="ml-auto rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
          Add files
        </span>
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="ml-auto text-muted-foreground hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lead and backing vocal file pickers for SayMaster song mode. */
export function VocalPicker({ leads, backs, onLeads, onBacks }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Picker
        label="Lead vocal"
        hint="Required. Doubles of the lead can go here too."
        files={leads}
        onChange={onLeads}
      />
      <Picker
        label="Backing vocals and ad-libs"
        hint="Optional. These are widened and sit under the lead."
        files={backs}
        onChange={onBacks}
      />
    </div>
  );
}
