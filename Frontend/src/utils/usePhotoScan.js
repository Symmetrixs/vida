import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../api/axios.js";
import { apiErrorText } from "./apiError.js";

export function useInspectionFindings(inspectionId) {
  const [findings, setFindings] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    if (!inspectionId) return Promise.resolve();
    return api.get("/findings/", { params: { inspection_id: inspectionId } })
      .then(r => setFindings(r.data || []))
      .catch(e => toast.error(apiErrorText(e, "Failed to load findings")))
      .finally(() => setLoaded(true));
  }, [inspectionId]);

  useEffect(() => { reload(); }, [reload]);

  const replaceForPhoto = useCallback((photoId, rows) => {
    setFindings(prev => [...prev.filter(f => f.photo_id !== photoId), ...rows]);
  }, []);

  const updateOne = useCallback((row) => setFindings(prev => prev.map(f => f.id === row.id ? { ...f, ...row } : f)), []);
  const removeOne = useCallback((id) => setFindings(prev => prev.filter(f => f.id !== id)), []);
  const addOne = useCallback((row) => setFindings(prev => [...prev, row]), []);

  return { findings, loaded, reload, replaceForPhoto, updateOne, removeOne, addOne };
}

export function usePhotoScanner({ onScanned }) {
  const [scanning, setScanning] = useState({});
  const [failed, setFailed] = useState({});
  const [progress, setProgress] = useState(null);

  const runScan = useCallback(async (photo) => {
    setScanning(s => ({ ...s, [photo.id]: true }));
    setFailed(f => { const n = { ...f }; delete n[photo.id]; return n; });
    try {
      const r = await api.post(`/photos/${photo.id}/scan`, null, { timeout: 180000 });
      onScanned(photo.id, r.data);
      return r.data;
    } catch (e) {
      setFailed(f => ({ ...f, [photo.id]: apiErrorText(e, "Scan failed") }));
      return null;
    } finally {
      setScanning(s => { const n = { ...s }; delete n[photo.id]; return n; });
    }
  }, [onScanned]);

  const scanPhoto = useCallback(async (photo, existingCount = 0) => {
    if (existingCount > 0 && !confirm(`This photo already has ${existingCount} finding(s). Scan it again? Defects that were already found, including ones you removed, are skipped.`)) return null;
    const result = await runScan(photo);
    if (result) {
      if (result.detected === 0) toast.success("Scanned: no defects found");
      else if (result.added === 0) toast.success(`Scanned: ${result.detected} defect(s) found, all already listed`);
      else toast.success(`Scanned: ${result.added} new finding(s)${result.skipped ? `, ${result.skipped} already listed` : ""}`);
    } else {
      toast.error("AI scan failed. Use Retry on the photo.");
    }
    return result;
  }, [runScan]);

  const scanMany = useCallback(async (photos, countFor) => {
    const withFindings = photos.filter(p => countFor(p.id) > 0);
    if (withFindings.length && !confirm(`${withFindings.length} of these photo(s) already have findings. Scan all ${photos.length} anyway? Defects already found are skipped.`)) return;
    let ok = 0;
    let bad = 0;
    for (let i = 0; i < photos.length; i++) {
      setProgress({ done: i, total: photos.length });
      const result = await runScan(photos[i]);
      if (result) ok += 1; else bad += 1;
    }
    setProgress(null);
    if (bad) toast.error(`${ok} scanned, ${bad} failed. Use Retry on the failed photos.`);
    else toast.success(`${ok} photo(s) scanned`);
  }, [runScan]);

  return { scanning, failed, progress, scanPhoto, scanMany, busy: !!progress || Object.keys(scanning).length > 0 };
}
