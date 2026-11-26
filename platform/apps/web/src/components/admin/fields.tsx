"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Small form controls for the admin content editor. Each is controlled: value in, onChange out. */

export interface CompetencyOption {
  ref: string;
  statement: string;
}
export interface CertOption {
  code: string;
  name: string;
  examStyle?: "performance" | "multiple-choice";
  domains: { key: string; name: string; competencies: CompetencyOption[] }[];
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function TextField({ label, hint, value, onChange, maxLength, placeholder, className, mono }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; maxLength?: number; placeholder?: string; className?: string; mono?: boolean }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => <Input id={id} value={value} maxLength={maxLength} placeholder={placeholder} className={mono ? "font-mono text-sm" : undefined} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function NumberField({ label, hint, value, onChange, min, max, className }: { label: string; hint?: ReactNode; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; className?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )}
    </Field>
  );
}

export function TextAreaField({ label, hint, value, onChange, rows = 4, mono, className }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean; className?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => <Textarea id={id} rows={rows} value={value} spellCheck={!mono} className={mono ? "font-mono text-sm" : undefined} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function CheckboxField({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <input id={id} type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <Label htmlFor={id}>{label}</Label>
      </span>
      {hint ? <FieldHint className="pl-6">{hint}</FieldHint> : null}
    </div>
  );
}

/** Competencies of one cert at a time: pick the cert, then add competencies from its domains. The first one decides the item's cert. */
export function CompetencyPicker({ label, hint, certs, value, onChange, single }: { label: string; hint?: ReactNode; certs: CertOption[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const id = useId();
  const firstCert = value[0]?.split("/")[0]?.toUpperCase();
  const [cert, setCert] = useState(firstCert ?? certs[0]?.code ?? "");
  const current = certs.find((c) => c.code === cert);
  const statements = new Map(certs.flatMap((c) => c.domains.flatMap((d) => d.competencies.map((x) => [x.ref, x.statement] as const))));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((ref, i) => (
            <li key={ref} className="flex items-start justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span>
                <span className="font-mono text-xs text-muted-foreground">{ref}</span>
                {i === 0 && !single ? <span className="ml-2 text-xs font-semibold text-primary">decides the cert</span> : null}
                <br />
                {statements.get(ref) ?? <span className="text-destructive">Not in the current curriculum</span>}
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remove ${ref}`} onClick={() => onChange(value.filter((r) => r !== ref))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {single && value.length > 0 ? null : (
        <div className="flex flex-wrap gap-2">
          <Select aria-label={`${label}: cert`} className="w-auto" value={cert} onChange={(e) => setCert(e.target.value)}>
            {certs.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Select
            id={id}
            aria-label={`${label}: add a competency`}
            className="min-w-0 flex-1"
            value=""
            onChange={(e) => {
              if (e.target.value && !value.includes(e.target.value)) onChange([...value, e.target.value]);
            }}
          >
            <option value="">Add a competency…</option>
            {current?.domains.map((d) => (
              <optgroup key={d.key} label={d.name}>
                {d.competencies.map((c) => (
                  <option key={c.ref} value={c.ref} disabled={value.includes(c.ref)}>
                    {c.statement}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      )}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </fieldset>
  );
}

export interface DocLink {
  title: string;
  url: string;
}

export function DocLinksField({ label, hint, value, onChange, max }: { label: string; hint?: ReactNode; value: DocLink[]; onChange: (v: DocLink[]) => void; max?: number }) {
  const set = (i: number, patch: Partial<DocLink>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {value.map((d, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input aria-label={`${label} ${i + 1}: title`} placeholder="Title" className="min-w-40 flex-1" value={d.title} onChange={(e) => set(i, { title: e.target.value })} />
          <Input aria-label={`${label} ${i + 1}: URL`} placeholder="https://kubernetes.io/docs/…" type="url" className="min-w-56 flex-[2]" value={d.url} onChange={(e) => set(i, { url: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {max !== undefined && value.length >= max ? null : (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, { title: "", url: "" }])}>
          <Plus /> Add link
        </Button>
      )}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </fieldset>
  );
}

/** A list of short strings (hints, images, cluster names), one input each. */
export function StringListField({ label, hint, value, onChange, max, multiline, mono, addLabel = "Add" }: { label: string; hint?: ReactNode; value: string[]; onChange: (v: string[]) => void; max?: number; multiline?: boolean; mono?: boolean; addLabel?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {value.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          {multiline ? (
            <Textarea aria-label={`${label} ${i + 1}`} rows={2} className={cn("flex-1", mono && "font-mono text-sm")} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          ) : (
            <Input aria-label={`${label} ${i + 1}`} className={cn("flex-1", mono && "font-mono text-sm")} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          )}
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {max !== undefined && value.length >= max ? null : (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, ""])}>
          <Plus /> {addLabel}
        </Button>
      )}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </fieldset>
  );
}
