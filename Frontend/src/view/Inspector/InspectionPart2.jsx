import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import InspectionPhoto from "./InspectionPhoto.jsx";

export default function InspectionPart2() {
  const { state }    = useLocation();
  const navigate     = useNavigate();
  const inspectionId = state?.inspectionId;
  const [photoState, setPhotoState] = useState({ groups: [], aiResults: {}, savedAnnot: {} });

  useEffect(() => {
    if (inspectionId) sessionStorage.setItem("vida_current_inspId", inspectionId);
  }, [inspectionId]);

  if (!inspectionId) { navigate("/inspector/inspections"); return null; }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span className="badge-blue">Step 2 of 3</span> Photo & AI Detection
        </div>
        <h1 className="page-title">Upload Photos</h1>
        <p className="page-subtitle">Upload images and run AI defect detection</p>
      </div>
      <div className="flex gap-2 mb-2">
        {["General Info","Findings","Review"].map((s,i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= 1 ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`}/>
        ))}
      </div>
      <InspectionPhoto inspectionId={inspectionId} embedded onStateChange={setPhotoState}/>
      <div className="flex justify-between pt-2">
        <button
          onClick={() => navigate("/inspector/inspections/new/part1", { state: { inspectionId } })}
          className="btn-secondary"
        >
          <ChevronLeft size={16}/> Back
        </button>
        <button
          onClick={() => navigate("/inspector/inspections/new/part3", {
            state: { inspectionId, groups: photoState.groups }
          })}
          className="btn-primary"
        >
          Next: Review <ChevronRight size={16}/>
        </button>
      </div>
    </div>
  );
}