import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/auth.js";
import { AnimatePresence } from "framer-motion";

import Login           from "./view/Auth/Login.jsx";
import ForgotPassword  from "./view/Auth/ForgotPassword.jsx";
import ResetPassword   from "./view/Auth/ResetPassword.jsx";
import ReportDefect    from "./view/Public/ReportDefect.jsx";

import AppLayout       from "./components/AppLayout.jsx";
import LoadingScreen   from "./components/LoadingScreen.jsx";

import Home            from "./view/Common/Home.jsx";
import Notifications   from "./view/Common/Notifications.jsx";
import Profile         from "./view/Common/Profile.jsx";
import Settings        from "./view/Common/Settings.jsx";

import InspectionManagement from "./view/Inspector/InspectionManagement.jsx";
import InspectionPart1      from "./view/Inspector/InspectionPart1.jsx";
import InspectionPart2      from "./view/Inspector/InspectionPart2.jsx";
import InspectionPart3      from "./view/Inspector/InspectionPart3.jsx";
import InspectionPhoto      from "./view/Inspector/InspectionPhoto.jsx";
import EditInspectionPart1  from "./view/Inspector/EditInspectionPart1.jsx";
import AssignedInspections  from "./view/Inspector/AssignedInspections.jsx";
import ReportManagement     from "./view/Inspector/ReportManagement.jsx";
import ReportView           from "./view/Inspector/ReportView.jsx";
import TeamSharedReport     from "./view/Inspector/TeamSharedReport.jsx";

import RepairJob       from "./view/Common/RepairJob.jsx";

import JobList         from "./view/Maintenance/JobList.jsx";

import Complaints        from "./view/Admin/Complaints.jsx";
import ComplaintReview   from "./view/Admin/ComplaintReview.jsx";
import SeverityReview    from "./view/Admin/SeverityReview.jsx";
import InspectionReview  from "./view/Admin/InspectionReview.jsx";
import RepairAssignment  from "./view/Admin/RepairAssignment.jsx";
import RepairReview      from "./view/Admin/RepairReview.jsx";
import MaintenanceStaff  from "./view/Admin/MaintenanceStaff.jsx";
import AllReports      from "./view/Admin/Reports.jsx";
import Analytics       from "./view/Admin/Analytics.jsx";
import StaffAccounts   from "./view/Admin/StaffAccounts.jsx";
import Buildings       from "./view/Admin/Vessels.jsx";

const INSPECTOR = ["inspector"];
const MAINTENANCE = ["maintenance"];
const FACILITY_MANAGER = ["facility_manager"];
const ADMIN = ["admin"];
const MANAGERS = ["facility_manager", "admin"];
const JOB_VIEWERS = ["maintenance", "facility_manager", "admin"];

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <Navigate to="/" replace />;
  return children;
}

const only = (roles, element) => <RequireRole roles={roles}>{element}</RequireRole>;

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/login"           element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/report-defect"   element={<ReportDefect />} />

        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index                         element={<Home />} />
          <Route path="notifications"          element={<Notifications />} />
          <Route path="profile"                element={<Profile />} />
          <Route path="settings"               element={<Settings />} />

          <Route path="inspections"            element={only(INSPECTOR, <InspectionManagement />)} />
          <Route path="inspections/new/part1"  element={only(INSPECTOR, <InspectionPart1 />)} />
          <Route path="inspections/new/part2"  element={only(INSPECTOR, <InspectionPart2 />)} />
          <Route path="inspections/new/part3"  element={only(INSPECTOR, <InspectionPart3 />)} />
          <Route path="inspections/:id/photo"  element={only(INSPECTOR, <InspectionPhoto />)} />
          <Route path="inspections/:id/edit"   element={only(INSPECTOR, <EditInspectionPart1 />)} />
          <Route path="assigned"               element={only(INSPECTOR, <AssignedInspections />)} />
          <Route path="reports"                element={only(INSPECTOR, <ReportManagement />)} />
          <Route path="reports/:id"            element={<ReportView />} />
          <Route path="shared"                 element={only(INSPECTOR, <TeamSharedReport />)} />

          <Route path="jobs/board"             element={only(MAINTENANCE, <JobList key="board" mode="board" />)} />
          <Route path="jobs/assigned"          element={only(MAINTENANCE, <JobList key="assigned" mode="assigned" />)} />
          <Route path="jobs/claimed"           element={only(MAINTENANCE, <JobList key="claimed" mode="claimed" />)} />
          <Route path="jobs/:id"               element={only(JOB_VIEWERS, <RepairJob />)} />

          <Route path="complaints"             element={only(FACILITY_MANAGER, <Complaints />)} />
          <Route path="severity-review"        element={only(FACILITY_MANAGER, <SeverityReview />)} />
          <Route path="complaints/:id/review"  element={only(MANAGERS, <ComplaintReview />)} />
          <Route path="inspections/:id/review" element={only(MANAGERS, <InspectionReview />)} />
          <Route path="repair-assignment"      element={only(FACILITY_MANAGER, <RepairAssignment />)} />
          <Route path="repair-review"          element={only(FACILITY_MANAGER, <RepairReview />)} />
          <Route path="maintenance-staff"      element={only(FACILITY_MANAGER, <MaintenanceStaff />)} />
          <Route path="all-reports"            element={only(MANAGERS, <AllReports />)} />

          <Route path="statistics"             element={only(ADMIN, <Analytics />)} />
          <Route path="staff"                  element={only(ADMIN, <StaffAccounts />)} />
          <Route path="buildings"              element={only(ADMIN, <Buildings />)} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
