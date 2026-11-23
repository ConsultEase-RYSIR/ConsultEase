"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DAYS, DURATIONS, GRACES, TIME_OPTIONS, dateLabel, dayError, dayName, findConflicts, fmtMin, generateSlots, nextDateKey,
  type ApptLite, type Conflict, type DayInput,
} from "@/lib/availability";

type Settings = { durationMin: number; graceMin: number; autoCancel: boolean; requireReschedule: boolean; building: string; floor: string; room: string; meetingLink: string };

const FIELD = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function TimeSelect({ label, value, onChange, invalid, kind }: { label: string; value: number; onChange: (v: number) => void; invalid: boolean; kind: "start" | "end" }) {
  const base = TIME_OPTIONS.filter((m) => (kind === "start" ? m < 1440 : m > 0));   // a window can't start at midnight-end or end at midnight-start
  const opts = base.includes(value) ? base : [...base, value].sort((a, b) => a - b);
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className={`w-[124px] rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 ${invalid ? "border-red-600" : "border-gray-300 focus:border-brand"}`}>
      {opts.map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
    </select>
  );
}

export function AvailabilityForm({ initialDays, initialSettings, appts, todayKey, nowMin }: {
  initialDays: DayInput[]; initialSettings: Settings; appts: ApptLite[]; todayKey: string; nowMin: number;
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState({ days: initialDays, settings: initialSettings });
  const [preview, setPreview] = useState(() => (initialDays.find((d) => d.enabled) ?? initialDays[0]).weekday);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [serverConflicts, setServerConflicts] = useState<Conflict[]>([]);

  const dirty = JSON.stringify({ days, settings }) !== JSON.stringify(saved);
  const conflicts = useMemo(() => findConflicts(days, appts), [days, appts]);
  const conflictDays = new Set(conflicts.map((c) => c.weekday));
  const errors = useMemo(() => Object.fromEntries(days.map((d) => [d.weekday, dayError(d, settings.durationMin)])), [days, settings.durationMin]);
  const linkBad = settings.meetingLink.trim() !== "" && !/^https?:\/\/\S+$/i.test(settings.meetingLink.trim());
  const needsLink = days.some((d) => d.enabled && d.online) && !settings.meetingLink.trim();
  const hasError = Object.values(errors).some(Boolean) || linkBad;
  const shown = conflicts.length ? conflicts : serverConflicts;

  const setDay = (w: number, patch: Partial<DayInput>) => { setMsg(null); setServerConflicts([]); setDays((ds) => ds.map((d) => (d.weekday === w ? { ...d, ...patch } : d))); };
  const setSet = <K extends keyof Settings>(k: K, v: Settings[K]) => { setMsg(null); setSettings((s) => ({ ...s, [k]: v })); };
  const toggleMode = (d: DayInput, key: "faceToFace" | "online") => setDay(d.weekday, { [key]: !d[key] });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/professor/availability", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days, settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved({ days, settings }); setServerConflicts([]); setMsg({ ok: true, text: "Availability saved. Students now see these slots." }); router.refresh();
      } else if (res.status === 409) { setServerConflicts(data.conflicts ?? []); setMsg({ ok: false, text: "Nothing was saved. Fix the conflict first." }); }
      else setMsg({ ok: false, text: data.error ?? "We couldn't save your changes. Try again." });
    } catch { setMsg({ ok: false, text: "We couldn't reach the server. Check your connection and try again." }); }
    setBusy(false);
  }

  const pd = days.find((d) => d.weekday === preview)!;
  const pKey = nextDateKey(pd.weekday, todayKey, nowMin, pd.endMin);
  const slots = pd.enabled && !errors[pd.weekday] ? generateSlots(pd.startMin, pd.endMin, settings.durationMin) : [];
  const booked = (s: number) => appts.some((a) => a.dateKey === pKey && a.startMin < s + settings.durationMin && a.endMin > s);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Availability &amp; settings</h1>
          <p className="mt-1 text-muted">Students only see slots you open here. Overlaps are flagged before they are saved.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={save} disabled={busy || !dirty || hasError || conflicts.length > 0} className={`btn px-5 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <p role="status" className={`max-w-[260px] text-right text-xs ${msg?.ok ? "text-green-800" : "text-red-700"}`}>{msg?.text}</p>
        </div>
      </div>

      {shown.length > 0 && (
        <div role="alert" className="mt-5 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-800">
          <b>Conflict detected:</b> {shown[0].message} Shorten the window or move the appointment.
          {shown.length > 1 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">{shown.slice(1, 4).map((c) => <li key={c.apptId}>{c.message}</li>)}{shown.length > 4 && <li>and {shown.length - 4} more.</li>}</ul>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="card">
            <h2 className="text-xl font-bold">Weekly consultation hours</h2>
            <div className="mt-4 divide-y divide-line rounded-xl border border-line">
              {days.map((d) => {
                const name = dayName(d.weekday), clash = conflictDays.has(d.weekday), err = errors[d.weekday];
                return (
                  <div key={d.weekday} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl ${clash ? "bg-red-50" : ""}`}>
                    <label className="flex w-36 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={d.enabled} onChange={(e) => setDay(d.weekday, { enabled: e.target.checked })} className="h-4 w-4 accent-brand" />
                      <span className={`font-semibold ${d.enabled ? "" : "text-muted"}`}>{name}</span>
                    </label>
                    {d.enabled ? (
                      <>
                        <TimeSelect label={`${name} start time`} value={d.startMin} onChange={(v) => setDay(d.weekday, { startMin: v })} invalid={clash || !!err} kind="start" />
                        <span className="text-muted">to</span>
                        <TimeSelect label={`${name} end time`} value={d.endMin} onChange={(v) => setDay(d.weekday, { endMin: v })} invalid={clash || !!err} kind="end" />
                        <div className="flex gap-1.5" role="group" aria-label={`${name} consultation modes`}>
                          {([["faceToFace", "Face-to-face"], ["online", "Online"]] as const).map(([k, label]) => (
                            <button key={k} type="button" aria-pressed={d[k]} onClick={() => toggleMode(d, k)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${FOCUS} ${d[k] ? "bg-tint text-brand" : "bg-gray-100 text-muted line-through decoration-1"}`}>{label}</button>
                          ))}
                        </div>
                        {clash && <b className="text-sm text-red-700">Overlap</b>}
                        {err && <p className="basis-full text-sm text-red-700">{err}</p>}
                      </>
                    ) : <span className="text-sm text-muted">Not available</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Generated slots · {dateLabel(pKey).split(",")[0]}</h2>
              <div className="flex gap-1.5" role="tablist" aria-label="Preview day">
                {days.filter((d) => d.enabled).map((d) => (
                  <button key={d.weekday} role="tab" aria-selected={preview === d.weekday} onClick={() => setPreview(d.weekday)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${FOCUS} ${preview === d.weekday ? "border-brand bg-tint text-brand" : "border-gray-300 bg-white"}`}>{dayName(d.weekday).slice(0, 3)}</button>
                ))}
              </div>
            </div>
            {pd.enabled ? (
              slots.length ? (
                <>
                  <p className="mt-1 text-sm text-muted">Showing {dateLabel(pKey)}. {settings.durationMin}-minute slots from {fmtMin(pd.startMin)} to {fmtMin(pd.endMin)}.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <span key={s} className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${booked(s) ? "bg-gray-100 text-muted" : "bg-tint text-brand"}`}>{fmtMin(s)}{booked(s) && " · Booked"}</span>
                    ))}
                  </div>
                </>
              ) : <p className="mt-3 text-sm text-muted">Fix the hours above to see this day&apos;s slots.</p>
            ) : <p className="mt-3 text-sm text-muted">Switch on a day above to preview its slots.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <section className="card">
            <h2 className="text-lg font-bold">Queue rules</h2>
            <label className="mt-3 block text-sm font-semibold" htmlFor="dur">Consultation duration</label>
            <select id="dur" className={`${FIELD} mt-1`} value={settings.durationMin} onChange={(e) => setSet("durationMin", Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <label className="mt-3 block text-sm font-semibold" htmlFor="grace">Check-in grace period</label>
            <select id="grace" className={`${FIELD} mt-1`} value={settings.graceMin} onChange={(e) => setSet("graceMin", Number(e.target.value))}>
              {GRACES.map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={settings.autoCancel} onChange={(e) => setSet("autoCancel", e.target.checked)} />
              <span>Cancel automatically after the grace period (I can override from the queue)</span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={settings.requireReschedule} onChange={(e) => setSet("requireReschedule", e.target.checked)} />
              <span>Require students to reschedule after a no-show</span>
            </label>
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">Consultation location</h2>
            <label className="mt-3 block text-sm font-semibold" htmlFor="bld">Building</label>
            <input id="bld" className={`${FIELD} mt-1`} maxLength={80} value={settings.building} onChange={(e) => setSet("building", e.target.value)} placeholder="Engineering Building" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-semibold" htmlFor="flr">Floor</label><input id="flr" className={`${FIELD} mt-1`} maxLength={80} value={settings.floor} onChange={(e) => setSet("floor", e.target.value)} placeholder="3rd Floor" /></div>
              <div><label className="block text-sm font-semibold" htmlFor="rm">Room</label><input id="rm" className={`${FIELD} mt-1`} maxLength={80} value={settings.room} onChange={(e) => setSet("room", e.target.value)} placeholder="305" /></div>
            </div>
            <label className="mt-3 block text-sm font-semibold" htmlFor="lnk">Online meeting link</label>
            <input id="lnk" className={`${FIELD} mt-1 ${linkBad ? "border-red-600" : ""}`} inputMode="url" value={settings.meetingLink} onChange={(e) => setSet("meetingLink", e.target.value)} placeholder="Paste your meeting link" />
            {linkBad && <p className="mt-1 text-xs text-red-700">The link must start with https://</p>}
            {needsLink && !linkBad && <p className="mt-1 text-xs text-amber-800">You offer online consultations. Add a meeting link so students can join.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}