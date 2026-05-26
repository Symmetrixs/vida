import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Pen, Square, Type, Eraser, Undo2, Trash2, ZoomIn, ZoomOut, RotateCcw, Move, Plus, Minus, MoveUpRight } from "lucide-react";

const COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ffffff", "#000000"];
const STROKE_WIDTHS = [2, 4, 8];
const DEFECT_COLORS = { crack: "#ef4444", faded_paint: "#f59e0b", spalling: "#8b5cf6", water_stain: "#3b82f6" };
const TOOLBAR_W = 64;
const HEADER_H  = 62;
const PAD       = 16;
const CELL_GAP  = 14;

const loadImage = (url) => new Promise((res, rej) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload  = () => res(img);
  img.onerror = rej;
  img.src = url;
});

const computeLayout = (loaded, windowW, windowH) => {
  const maxModalW = Math.min(windowW  * 0.96, 1400);
  const maxModalH = Math.min(windowH  * 0.94, 900);
  const canvasW   = Math.max(500, maxModalW - TOOLBAR_W - PAD * 2);
  const canvasH   = Math.max(350, maxModalH - HEADER_H  - PAD * 2);

  const n    = loaded.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = (canvasW - CELL_GAP * (cols - 1)) / cols;
  const cellH = (canvasH - CELL_GAP * (rows - 1)) / rows;

  const arranged = loaded.map((p, i) => {
    const col   = i % cols;
    const row   = Math.floor(i / cols);
    const scale = Math.min(cellW / p.naturalWidth, cellH / p.naturalHeight, 1);
    const dw    = p.naturalWidth  * scale;
    const dh    = p.naturalHeight * scale;
    const x     = col * (cellW + CELL_GAP) + (cellW - dw) / 2;
    const y     = row * (cellH + CELL_GAP) + (cellH - dh) / 2;
    return { ...p, x, y, scale };
  });

  return { arranged, canvasW, canvasH };
};

export default function AnnotationModal({ open, onClose, photos: photosProp, onSave }) {
  const photoCanvasRef = useRef(null);
  const annoCanvasRef  = useRef(null);
  const livePosRef     = useRef(new Map());
  const rafRef         = useRef(null);

  const [photoData,     setPhotoData]     = useState([]);
  const [canvasSize,    setCanvasSize]    = useState({ w: 800, h: 600 });
  const [tool,          setTool]          = useState("pen");
  const [color,         setColor]         = useState("#ef4444");
  const [strokeWidth,   setStrokeWidth]   = useState(3);
  const [actions,       setActions]       = useState([]);
  const [currentAction, setCurrentAction] = useState(null);
  const [isDrawing,     setIsDrawing]     = useState(false);
  const [viewScale,     setViewScale]     = useState(1);
  const [textOverlay,   setTextOverlay]   = useState(null);
  const [textValue,     setTextValue]     = useState("");
  const [movingPhotoId, setMovingPhotoId] = useState(null);
  const [moveOffset,    setMoveOffset]    = useState({ x: 0, y: 0 });
  const [selectedId,    setSelectedId]    = useState(null);

  useEffect(() => {
    if (!open || !photosProp?.length) return;
    setActions([]);
    setCurrentAction(null);
    setViewScale(1);
    setSelectedId(null);
    livePosRef.current.clear();

    Promise.all(photosProp.map(p => loadImage(p.url).then(img => ({
      id:           p.id,
      number:       p.number,
      label:        p.label || String(p.number || "?"),
      img,
      naturalWidth:  img.naturalWidth,
      naturalHeight: img.naturalHeight,
      detections:    p.detections || [],
    })))).then(loaded => {
      const { arranged, canvasW, canvasH } = computeLayout(loaded, window.innerWidth, window.innerHeight);
      setCanvasSize({ w: canvasW, h: canvasH });
      setPhotoData(arranged);
    });
  }, [open, photosProp]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (!photoData.length) return;
      const { arranged, canvasW, canvasH } = computeLayout(photoData, window.innerWidth, window.innerHeight);
      setCanvasSize({ w: canvasW, h: canvasH });
      setPhotoData(arranged);
      livePosRef.current.clear();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, photoData]);

  const getEffective = (p) => {
    const live = livePosRef.current.get(p.id);
    return live ? { ...p, ...live } : p;
  };

  const dimOf = (p) => ({
    w: p.naturalWidth  * (p.scale || 1),
    h: p.naturalHeight * (p.scale || 1),
  });

  const drawLabel = (ctx, x, y, label) => {
    ctx.save();
    ctx.font = "bold 13px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    const lx = x + 8;
    const ly = y + 8;
    const lw = tw + 16;
    const lh = 24;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, 6);
      ctx.fill();
    } else {
      ctx.fillRect(lx, ly, lw, lh);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, lx + 8, ly + lh / 2);
    ctx.restore();
  };

  const drawPhotoLayer = useCallback(() => {
    const canvas = photoCanvasRef.current;
    if (!canvas || !photoData.length) return;
    if (canvas.width  !== canvasSize.w) canvas.width  = canvasSize.w;
    if (canvas.height !== canvasSize.h) canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    photoData.forEach(p => {
      const eff    = getEffective(p);
      const { w, h } = dimOf(eff);
      ctx.drawImage(eff.img, eff.x, eff.y, w, h);

      if (selectedId === eff.id) {
        ctx.save();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 4;
        ctx.strokeRect(eff.x - 2, eff.y - 2, w + 4, h + 4);
        ctx.restore();
      }

      drawLabel(ctx, eff.x, eff.y, String(eff.label || eff.number || "?"));

      const s = eff.scale || 1;
      (eff.detections || []).forEach(d => {
        const c = DEFECT_COLORS[d.label] || "#6366f1";
        const { xmin = 0, ymin = 0, xmax = 0, ymax = 0 } = d.box || {};
        const dx = eff.x + xmin * s;
        const dy = eff.y + ymin * s;
        const dw = (xmax - xmin) * s;
        const dh = (ymax - ymin) * s;
        ctx.save();
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(dx, dy, dw, dh);
        const lbl = `${d.label?.replace("_", " ")} ${Math.round((d.score || 0) * 100)}%`;
        ctx.font = "bold 14px Inter, sans-serif";
        const tw = ctx.measureText(lbl).width + 10;
        ctx.setLineDash([]);
        ctx.fillStyle = c;
        ctx.fillRect(dx, dy - 22, tw, 22);
        ctx.fillStyle = "#fff";
        ctx.fillText(lbl, dx + 5, dy - 6);
        ctx.restore();
      });
    });
  }, [photoData, canvasSize, selectedId]);

  useEffect(() => { drawPhotoLayer(); }, [drawPhotoLayer]);

  const drawAction = (ctx, action) => {
    ctx.save();
    ctx.strokeStyle = action.color;
    ctx.fillStyle   = action.color;
    ctx.lineWidth   = action.width;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    if (action.type === "pen" && action.points?.length > 1) {
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      action.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (action.type === "rect") {
      ctx.strokeRect(action.x, action.y, action.w, action.h);
    } else if (action.type === "arrow" && action.x2 !== undefined) {
      const angle   = Math.atan2(action.y2 - action.y1, action.x2 - action.x1);
      const headLen = Math.max(14, action.width * 4);
      const headAng = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(action.x1, action.y1);
      ctx.lineTo(action.x2, action.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(action.x2, action.y2);
      ctx.lineTo(action.x2 - headLen * Math.cos(angle - headAng), action.y2 - headLen * Math.sin(angle - headAng));
      ctx.lineTo(action.x2 - headLen * Math.cos(angle + headAng), action.y2 - headLen * Math.sin(angle + headAng));
      ctx.closePath();
      ctx.fill();
    } else if (action.type === "text" && action.text) {
      ctx.font = `bold ${Math.max(action.width * 5, 14)}px Inter, sans-serif`;
      ctx.fillText(action.text, action.x, action.y);
    } else if (action.type === "eraser" && action.points?.length > 1) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = action.width * 6;
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      action.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    ctx.restore();
  };

  useEffect(() => {
    const canvas = annoCanvasRef.current;
    if (!canvas) return;
    if (canvas.width  !== canvasSize.w) canvas.width  = canvasSize.w;
    if (canvas.height !== canvasSize.h) canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    actions.forEach(a => drawAction(ctx, a));
    if (currentAction) drawAction(ctx, currentAction);
  }, [actions, currentAction, canvasSize]);

  const requestLiveRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawPhotoLayer();
    });
  }, [drawPhotoLayer]);

  const getPoint = (e) => {
    const canvas = annoCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  };

  const getPhotoAt = (pt) => {
    for (let i = photoData.length - 1; i >= 0; i--) {
      const p = photoData[i];
      const eff = getEffective(p);
      const { w, h } = dimOf(eff);
      if (pt.x >= eff.x && pt.x <= eff.x + w && pt.y >= eff.y && pt.y <= eff.y + h) return p;
    }
    return null;
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    const p = getPoint(e);
    if (tool === "move") {
      const t = getPhotoAt(p);
      if (t) { setSelectedId(t.id); setMovingPhotoId(t.id); setMoveOffset({ x: p.x - t.x, y: p.y - t.y }); }
      else   { setSelectedId(null); }
      return;
    }
    if (tool === "text") { setTextOverlay(p); setTextValue(""); return; }
    setIsDrawing(true);
    if      (tool === "pen"   || tool === "eraser") setCurrentAction({ type: tool,   points: [p], color, width: strokeWidth });
    else if (tool === "rect")   setCurrentAction({ type: "rect",  x: p.x, y: p.y, w: 0, h: 0, color, width: strokeWidth });
    else if (tool === "arrow")  setCurrentAction({ type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth });
  };

  const onPointerMove = (e) => {
    if (movingPhotoId) {
      e.preventDefault();
      const p = getPoint(e);
      livePosRef.current.set(movingPhotoId, { x: Math.max(0, p.x - moveOffset.x), y: Math.max(0, p.y - moveOffset.y) });
      requestLiveRedraw();
      return;
    }
    if (!isDrawing || !currentAction) return;
    e.preventDefault();
    const p = getPoint(e);
    if (currentAction.type === "pen"  || currentAction.type === "eraser") setCurrentAction(prev => ({ ...prev, points: [...prev.points, p] }));
    else if (currentAction.type === "rect")  setCurrentAction(prev => ({ ...prev, w: p.x - prev.x, h: p.y - prev.y }));
    else if (currentAction.type === "arrow") setCurrentAction(prev => ({ ...prev, x2: p.x, y2: p.y }));
  };

  const onPointerUp = (e) => {
    if (movingPhotoId) {
      e.preventDefault();
      const live = livePosRef.current.get(movingPhotoId);
      if (live) setPhotoData(prev => prev.map(p => p.id === movingPhotoId ? { ...p, x: live.x, y: live.y } : p));
      livePosRef.current.clear();
      setMovingPhotoId(null);
      return;
    }
    if (!isDrawing || !currentAction) return;
    e.preventDefault();
    setActions(prev => [...prev, currentAction]);
    setCurrentAction(null);
    setIsDrawing(false);
  };

  const onWheel = (e) => {
    if (tool !== "move") return;
    const p = getPoint(e);
    const target = getPhotoAt(p);
    if (!target) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setPhotoData(prev => prev.map(ph =>
      ph.id === target.id
        ? { ...ph, scale: Math.max(0.05, Math.min(3, (ph.scale || 1) + delta)) }
        : ph
    ));
    setSelectedId(target.id);
  };

  const resizeSelected = (delta) => {
    if (!selectedId) return;
    setPhotoData(prev => prev.map(p =>
      p.id === selectedId
        ? { ...p, scale: Math.max(0.05, Math.min(3, (p.scale || 1) + delta)) }
        : p
    ));
  };

  const resetLayout = () => {
    if (!photoData.length) return;
    const { arranged, canvasW, canvasH } = computeLayout(photoData, window.innerWidth, window.innerHeight);
    setCanvasSize({ w: canvasW, h: canvasH });
    setPhotoData(arranged);
    livePosRef.current.clear();
    setSelectedId(null);
  };

  const confirmText = () => {
    if (textValue.trim() && textOverlay)
      setActions(prev => [...prev, { type: "text", x: textOverlay.x, y: textOverlay.y, text: textValue.trim(), color, width: strokeWidth }]);
    setTextOverlay(null); setTextValue("");
  };

  const handleUndo  = () => setActions(prev => prev.slice(0, -1));
  const handleClear = () => { setActions([]); setCurrentAction(null); };

  const compositeCanvas = () => {
    const c = document.createElement("canvas");
    c.width  = canvasSize.w;
    c.height = canvasSize.h;
    const ctx = c.getContext("2d");
    ctx.drawImage(photoCanvasRef.current, 0, 0);
    ctx.drawImage(annoCanvasRef.current,  0, 0);
    return c;
  };

  const handleExport = () => {
    const a = document.createElement("a");
    a.download = `vida-annotated-${photoData.map(p => p.label || p.number).join("-") || "x"}.png`;
    a.href = compositeCanvas().toDataURL("image/png");
    a.click();
  };

  const handleSave = () => {
    onSave?.(photoData.map(p => p.id), compositeCanvas().toDataURL("image/png"), actions);
    onClose();
  };

  const isGroup = photoData.length > 1;
  const tools = [
    { id: "pen",    icon: Pen,         label: "Pen"   },
    { id: "rect",   icon: Square,      label: "Box"   },
    { id: "arrow",  icon: MoveUpRight, label: "Arrow" },
    { id: "text",   icon: Type,        label: "Text"  },
    { id: "eraser", icon: Eraser,      label: "Erase" },
    { id: "move",   icon: Move,        label: "Move"  },
  ];
  const cursor = { pen: "crosshair", rect: "crosshair", arrow: "crosshair", text: "text", eraser: "cell", move: movingPhotoId ? "grabbing" : "grab" }[tool] || "default";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: "min(96vw, 1400px)", height: "min(94vh, 900px)" }}
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0" style={{ height: HEADER_H }}>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                  {isGroup ? `Group · ${photoData.length} Photos` : `Photo ${photoData[0]?.label || photoData[0]?.number}`} — Annotate
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {photoData.reduce((s, p) => s + (p.detections?.length || 0), 0)} detection(s) · {actions.length} annotation(s)
                  {tool === "move" && " · scroll on photo to resize · Move tool to rearrange"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetLayout}  title="Reset photo layout" className="btn-secondary px-3 py-1.5 text-xs gap-1.5"><RotateCcw size={13}/> Reset Layout</button>
                <button onClick={handleExport} className="btn-secondary px-3 py-1.5 text-xs gap-1.5"><Download size={13}/> Export PNG</button>
                <button onClick={handleSave}   className="btn-primary px-3 py-1.5 text-xs">Save & Close</button>
                <button onClick={onClose}      className="btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2 py-3 bg-slate-50 dark:bg-slate-950 overflow-y-auto" style={{ width: TOOLBAR_W }}>
                {tools.map(t => (
                  <button
                    key={t.id} onClick={() => setTool(t.id)} title={t.label}
                    className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-all shrink-0 ${
                      tool === t.id ? "bg-primary-600 text-white shadow-md"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <t.icon size={16}/>{t.label}
                  </button>
                ))}

                {tool === "move" && selectedId && (
                  <>
                    <div className="w-8 border-t border-slate-200 dark:border-slate-700 my-1 shrink-0"/>
                    <button onClick={() => resizeSelected(0.1)}  title="Enlarge" className="w-11 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 shrink-0"><Plus  size={14}/></button>
                    <button onClick={() => resizeSelected(-0.1)} title="Shrink"  className="w-11 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 shrink-0"><Minus size={14}/></button>
                    <button onClick={() => setPhotoData(prev => prev.map(p => p.id === selectedId ? { ...p, scale: 1 } : p))} title="Reset" className="w-11 h-7 rounded-lg flex items-center justify-center text-[9px] text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0">1×</button>
                  </>
                )}

                <div className="w-8 border-t border-slate-200 dark:border-slate-700 my-1 shrink-0"/>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} title={c}
                    className={`w-7 h-7 rounded-full border-2 transition-all shrink-0 ${color === c ? "border-primary-500 scale-125 shadow-md" : "border-slate-300 dark:border-slate-600 hover:scale-110"}`}
                    style={{ background: c }}
                  />
                ))}

                <div className="w-8 border-t border-slate-200 dark:border-slate-700 my-1 shrink-0"/>
                {STROKE_WIDTHS.map(w => (
                  <button key={w} onClick={() => setStrokeWidth(w)} title={`Width ${w}`}
                    className={`w-11 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${strokeWidth === w ? "bg-primary-100 dark:bg-primary-900/40" : "hover:bg-slate-200 dark:hover:bg-slate-800"}`}
                  >
                    <div className="rounded-full bg-slate-700 dark:bg-slate-300" style={{ width: w * 4 + 4, height: w + 1 }}/>
                  </button>
                ))}

                <div className="w-8 border-t border-slate-200 dark:border-slate-700 my-1 shrink-0"/>
                <button onClick={handleUndo}  disabled={actions.length === 0} title="Undo"
                  className="w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-all shrink-0">
                  <Undo2 size={16}/>Undo
                </button>
                <button onClick={handleClear} disabled={actions.length === 0} title="Clear all"
                  className="w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 transition-all shrink-0">
                  <Trash2 size={16}/>Clear
                </button>

                <div className="w-8 border-t border-slate-200 dark:border-slate-700 my-1 shrink-0"/>
                <button onClick={() => setViewScale(s => Math.min(s + 0.25, 4))}   title="Zoom in"  className="w-11 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"><ZoomIn  size={14}/></button>
                <button onClick={() => setViewScale(1)}                             title="Fit"      className="w-11 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"><RotateCcw size={12}/></button>
                <button onClick={() => setViewScale(s => Math.max(s - 0.25, 0.25))} title="Zoom out" className="w-11 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"><ZoomOut size={14}/></button>
              </div>

              <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 flex items-start justify-center p-0 select-none">
                <div style={{ transform: `scale(${viewScale})`, transformOrigin: "top left", transition: "transform 0.2s", position: "relative", flexShrink: 0 }}>
                  <canvas ref={photoCanvasRef} className="block"/>
                  <canvas
                    ref={annoCanvasRef}
                    className="block absolute inset-0"
                    style={{ cursor }}
                    onMouseDown={onPointerDown} onMouseMove={onPointerMove}
                    onMouseUp={onPointerUp}     onMouseLeave={onPointerUp}
                    onTouchStart={onPointerDown} onTouchMove={onPointerMove}
                    onTouchEnd={onPointerUp}
                    onWheel={onWheel}
                  />

                  {textOverlay && (() => {
                    const c = annoCanvasRef.current;
                    if (!c) return null;
                    const rect = c.getBoundingClientRect();
                    const dispLeft = (textOverlay.x / c.width)  * rect.width;
                    const dispTop  = (textOverlay.y / c.height) * rect.height;
                    return (
                      <div className="absolute flex gap-1 items-center z-10" style={{ left: dispLeft, top: dispTop, transform: "translateY(-100%)" }}>
                        <input autoFocus value={textValue} onChange={e => setTextValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") confirmText(); if (e.key === "Escape") { setTextOverlay(null); setTextValue(""); } }}
                          placeholder="Type annotation…"
                          className="text-xs px-2 py-1 rounded-lg border border-primary-400 bg-white dark:bg-slate-800 dark:text-white shadow-lg outline-none focus:ring-2 focus:ring-primary-500 w-40"
                          style={{ color }}
                        />
                        <button onClick={confirmText} className="btn-primary px-2 py-1 text-xs rounded-lg">OK</button>
                        <button onClick={() => { setTextOverlay(null); setTextValue(""); }} className="btn-ghost px-2 py-1 text-xs rounded-lg">✕</button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="absolute bottom-3 left-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 flex items-center gap-3 text-xs text-slate-500 pointer-events-none">
                <span className="w-2 h-2 rounded-full" style={{ background: color }}/>
                <span className="capitalize">{tool}</span>
                <span>·</span><span>W{strokeWidth}</span>
                {viewScale !== 1 && <><span>·</span><span>View {Math.round(viewScale * 100)}%</span></>}
                {selectedId && tool === "move" && (() => {
                  const sel = photoData.find(p => p.id === selectedId);
                  return sel ? <><span>·</span><span>{sel.label} @ {Math.round((sel.scale || 1) * 100)}%</span></> : null;
                })()}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}