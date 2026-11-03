import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { STATUS_TONE } from "@/lib/api";

export const Reveal = ({ children, delay = 0, className = "", y = 24 }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
};

export const Badge = ({ status, children, testid }) => (
  <span data-testid={testid} className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-sm ${STATUS_TONE[status] || "bg-stone-100 text-stone-700"}`}>
    {children || String(status || "").replace(/_/g, " ")}
  </span>
);

export const Field = ({ label, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</span>
    {children}
  </label>
);

export const Empty = ({ title, text, action }) => (
  <div className="border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center" data-testid="empty-state">
    <p className="font-display text-2xl">{title}</p>
    {text && <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const Skeleton = ({ className }) => <div className={`skeleton ${className}`} />;

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try { const d = await fn(); if (n === seq.current) { setData(d); setError(null); } }
    catch (e) { if (n === seq.current) setError(e); }
    finally { if (n === seq.current) setLoading(false); }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const PageHead = ({ title, sub, children }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="font-display text-3xl font-semibold sm:text-4xl" data-testid="page-title">{title}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Btn = ({ variant = "dark", className = "", ...p }) => (
  <button {...p} className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50 ${variant === "gold" ? "btn-gold" : variant === "line" ? "btn-line bg-white" : "btn-dark"} ${className}`} />
);
