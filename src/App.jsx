// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Upload, Plus, Trash2, Share2,
  Link as LinkIcon, Calculator, Users, Receipt, Download
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

/* --- utility helpers --- */
const currencyFormatter = (v, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(v) ? v : 0);
const toCents = (n) => Math.round((parseFloat(n || 0) || 0) * 100);
const fromCents = (c) => (c || 0) / 100;

/* --- encode/decode share links --- */
const encodeState = (state) => {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  catch { return ""; }
};
const decodeState = (s) => {
  try { return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  catch { return null; }
};

/* --- main component --- */
export default function App() {
  const fileInputRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [participants, setParticipants] = useState([{ id: uuidv4(), name: "You" }]);
  const [assignments, setAssignments] = useState({});
  const [taxPercent, setTaxPercent] = useState(0);
  const [tipPercent, setTipPercent] = useState(0);
  const [currency, setCurrency] = useState("USD");

  /* restore from link or localStorage */
  useEffect(() => {
    const url = new URL(window.location.href);
    const packed = url.searchParams.get("s");
    if (packed) {
      const restored = decodeState(packed);
      if (restored) {
        setImageUrl(restored.imageUrl || "");
        setItems(restored.items || []);
        setParticipants(restored.participants || []);
        setAssignments(Object.fromEntries(Object.entries(restored.assignments || {}).map(([k, a]) => [k, new Set(a)])));
        setTaxPercent(restored.taxPercent || 0);
        setTipPercent(restored.tipPercent || 0);
        setCurrency(restored.currency || "USD");
      }
    }
  }, []);

  /* persist */
  useEffect(() => {
    const s = {
      imageUrl, items, participants,
      assignments: Object.fromEntries(Object.entries(assignments).map(([k, set]) => [k, Array.from(set)])),
      taxPercent, tipPercent, currency
    };
    localStorage.setItem("receipt-splitter-state", JSON.stringify(s));
  }, [imageUrl, items, participants, assignments, taxPercent, tipPercent, currency]);

  /* derived values */
  const subtotalCents = useMemo(() => items.reduce((a, i) => a + i.priceCents, 0), [items]);
  const perPerson = useMemo(() => {
    const shares = Object.fromEntries(participants.map(p => [p.id, 0]));
    for (const it of items) {
      const assigned = Array.from(assignments[it.id] || []);
      if (!assigned.length) continue;
      const each = Math.round(it.priceCents / assigned.length);
      for (const pid of assigned) shares[pid] += each;
    }
    const taxCents = Math.round(subtotalCents * (taxPercent / 100));
    const tipCents = Math.round(subtotalCents * (tipPercent / 100));
    const extra = taxCents + tipCents;
    const denom = Math.max(1, Object.values(shares).reduce((a,b)=>a+b,0));
    return participants.map(p => {
      const base = shares[p.id] || 0;
      const prorata = Math.round((base/denom)*extra);
      return { id:p.id, name:p.name, total: fromCents(base+prorata), base:fromCents(base), extra:fromCents(prorata) };
    });
  }, [items, participants, assignments, subtotalCents, taxPercent, tipPercent]);

  /* handlers */
  const handleFile = async (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setIsOcrLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        setItems(
          data.items.map(it => ({
            id: uuidv4(),
            name: it.name,
            priceCents: toCents(it.price)
          }))
        );
      } else {
        alert("OCR didn’t return any items. Try a clearer photo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error running OCR. Check server logs or API key.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  /* UI */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Receipt className="w-6 h-6"/> Splitwise-Lite (OpenAI OCR)
      </h1>

      {/* Upload Section */}
      <section className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <Upload className="w-4 h-4"/> Upload Receipt
        </h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => handleFile(e.target.files[0])}
        />
        {isOcrLoading && (
          <div className="mt-2 text-neutral-400 flex items-center gap-2">
            <Loader2 className="animate-spin w-4 h-4"/> Processing with OpenAI…
          </div>
        )}
        {imageUrl && <img src={imageUrl} alt="receipt" className="mt-3 rounded-lg max-h-80 border border-neutral-700" />}
      </section>

      {/* Items Table */}
      <section className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4"/> Items
        </h2>
        {items.length === 0 ? (
          <p className="text-neutral-400">No items yet. Upload a receipt.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-1">Item</th>
                <th className="text-right p-1">Price</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td className="p-1">{it.name}</td>
                  <td className="text-right p-1">
                    {currencyFormatter(fromCents(it.priceCents), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Totals */}
      <section className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <Users className="w-4 h-4"/> Totals
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-1">Person</th>
              <th className="text-right p-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {perPerson.map(p => (
              <tr key={p.id}>
                <td className="p-1">{p.name}</td>
                <td className="text-right p-1 font-semibold">
                  {currencyFormatter(p.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
