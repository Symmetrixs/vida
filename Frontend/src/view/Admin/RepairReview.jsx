import { useState, useEffect } from "react";
import { Scale } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import { JobRow, ListShell } from "../../components/RepairParts.jsx";

export default function RepairReview() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/repairs/?status=awaiting_review")
      .then(r => setJobs(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load repairs awaiting review")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><Scale size={22}/> Repair Review</h1>
          <p className="page-subtitle">Finished repairs waiting for you. Open one to compare the before and after photos and AI counts, then approve, send back or reassign.</p>
        </div>
        <span className="badge-blue text-sm px-3 py-1.5">{jobs.length} waiting</span>
      </div>
      <ListShell loading={loading} empty={jobs.length === 0 && "No repairs are waiting for review"} icon={Scale}>
        {jobs.map((job, i) => <JobRow key={job.id} job={job} index={i} showWorker/>)}
      </ListShell>
    </div>
  );
}
