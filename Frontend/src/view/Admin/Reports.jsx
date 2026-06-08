import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Search, Eye, Trash2, Download, ChevronDown, X,
  Filter, ArrowUpDown, Building2, User, Calendar, FileDown, File, Loader2,
} from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { exportReportPdf  } from "../../model/pdfGenerator.js";
import { exportReportDocx } from "../../model/docGenerator.js";

const STATUS_OPTS = ["all", "draft", "published"];

const SORT_OPTS = [
  { value: "newest",   label: "Newest first"  },
  { value: "oldest",   label: "Oldest first"  },
  { value: "title",    label: "Title A–Z"     },
  { value: "building", label: "Building A–Z"  },
  { value: "creator",  label: "Creator A–Z"   },
];

export default function AdminReports() {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [status,     setStatus]     = useState("all");
  const [sort,       setSort]       = useState("newest");
  const [exporting,  setExporting]  = useState(null);
  const [showExport, setShowExport] = useState(null);

  const fetchReports = () => {
    setLoading(true);
    api.get("/reports/").then(r => setReports(r.data))
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchReports(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try { await api.delete(`/reports/${id}`); toast.success("Report deleted"); fetchReports(); }
    catch { toast.error("Delete failed"); }
  };

  const handleExport = async (reportId, format) => {
    setExporting(reportId + "_" + format);
    setShowExport(null);
    try {
      const res = await api.get(`/reports/${reportId}/export`);
      const { report, inspection, findings, photos, groups, creator } = res.data;
      const header = { title: report.title, summary: report.summary || "", recommendations: report.recommendations || "" };
      const rows   = report.row_data || {};
      if (format === "pdf") await exportReportPdf({ report, inspection, findings, photos, groups, creator, header, rows });
      else                  await exportReportDocx({ report, inspection, findings, photos, groups, creator, header, rows });
      toast.success("Exported as " + format.toUpperCase());
    } catch (e) { toast.error("Export failed: " + e.message); }
    finally { setExporting(null); }
  };

  const filtered = useMemo(() => {
    let list = [...reports];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.inspections?.title?.toLowerCase().includes(q) ||
        r.inspections?.buildings?.name?.toLowerCase().includes(q) ||
        r.users?.name?.toLowerCase().includes(q)
      );
    }
    if (status !== "all") list = list.filter(r => r.status === status);
    list.sort((a, b) => {
      if (sort === "newest")   return new Date(b.created_at) - new Date(a.created_at);
      if (sort === "oldest")   return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "title")    return (a.title || "").localeCompare(b.title || "");
      if (sort === "building") return (a.inspections?.buildings?.name || "").localeCompare(b.inspections?.buildings?.name || "");
      if (sort === "creator")  return (a.users?.name || "").localeCompare(b.users?.name || "");
      return 0;
    });
    return list;
  }, [reports, search, status, sort]);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileText size={22}/> Reports</h1>
          <p className="page-subtitle">View, filter, and export all inspection reports</p>
        </div>
        <span className="badge-blue text-sm px-3 py-1.5 self-start">{filtered.length} report{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="card p-3 flex items-center gap-3 flex-1">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300"
            placeholder="Search by title, building, or creator…"
          />
          {search && <button onClick={() => setSearch("")}><X size={14} className="text-slate-400 hover:text-slate-600"/></button>}
        </div>
        <div className="flex gap-2">
          <div className="card p-1 flex gap-1">
            {STATUS_OPTS.map(f => (
              <button key={f} onClick={() => setStatus(f)}
                className={"px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize " + (status === f ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
          <div className="card px-3 py-1 flex items-center gap-1">
            <ArrowUpDown size={12} className="text-slate-400 shrink-0"/>
            <select value={sort} onChange={e => setSort(e.target.value)} className="bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 outline-none cursor-pointer">
              {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
            <p className="text-sm text-slate-400">{search || status !== "all" ? "No reports match your filters" : "No reports yet"}</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-12 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <span className="col-span-4">Report</span>
              <span className="col-span-3">Building</span>
              <span className="col-span-2">Created By</span>
              <span className="col-span-1">Status</span>
              <span className="col-span-2 text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r, i) => {
                const expKey = r.id + "_pdf";
                const isExp  = exporting?.startsWith(r.id);
                return (
                  <motion.div
                    key={r.id}
                    className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  >
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-primary-600 dark:text-primary-400"/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{r.title}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar size={10}/> {new Date(r.created_at).toLocaleDateString("en-MY")}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-3 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 min-w-0 pr-2">
                      <Building2 size={12} className="shrink-0 text-slate-400"/>
                      <span className="truncate">{r.inspections?.buildings?.name || "—"}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 min-w-0 pr-2">
                      <User size={12} className="shrink-0 text-slate-400"/>
                      <span className="truncate">{r.users?.name || "—"}</span>
                    </div>
                    <div className="col-span-1">
                      <span className={r.status === "published" ? "badge-green" : "badge-gray"}>{r.status}</span>
                    </div>
                    <div className="col-span-2 flex justify-end items-center gap-1">
                      <div className="relative">
                        <button
                          onClick={() => setShowExport(prev => prev === r.id ? null : r.id)}
                          disabled={isExp}
                          className="btn-ghost p-1.5 rounded-lg flex items-center gap-1 text-xs"
                          title="Export"
                        >
                          {isExp ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
                        </button>
                        <AnimatePresence>
                          {showExport === r.id && (
                            <motion.div
                              className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 z-20 overflow-hidden"
                              initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                            >
                              <button onClick={() => handleExport(r.id, "pdf")} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                <FileDown size={13} className="text-red-500"/> Download PDF
                              </button>
                              <button onClick={() => handleExport(r.id, "docx")} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                <File size={13} className="text-blue-500"/> Download Word
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}