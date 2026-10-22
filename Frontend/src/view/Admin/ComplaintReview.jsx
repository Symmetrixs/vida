import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";

export default function ComplaintReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const fallback = hasRole("facility_manager") ? "/complaints" : "/notifications";

  useEffect(() => {
    api.get(`/complaints/${id}/review`).then(r => {
      const inspectionId = r.data.complaint?.inspection_id;
      if (inspectionId) {
        navigate(`/inspections/${inspectionId}/review`, { replace: true });
      } else {
        toast.error("No inspection is linked to this complaint yet");
        navigate(fallback, { replace: true });
      }
    }).catch(() => {
      toast.error("Failed to load the complaint");
      navigate(fallback, { replace: true });
    });
  }, [id, fallback, navigate]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );
}
