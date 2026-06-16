import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { AnimatePresence } from "framer-motion";

import Login        from "./view/Auth/Login.jsx";
import Register     from "./view/Auth/Register.jsx";
import ForgotPassword  from "./view/Auth/ForgotPassword.jsx";
import ResetPassword   from "./view/Auth/ResetPassword.jsx";

import AdminLayout  from "./view/Admin/AdminLayout.jsx";
import Dashboard    from "./view/Admin/Dashboard.jsx";
import Users        from "./view/Admin/Users.jsx";
import Vessels      from "./view/Admin/Vessels.jsx";
import Reports      from "./view/Admin/Reports.jsx";
import Analytics    from "./view/Admin/Analytics.jsx";
import AdminNotifications from "./view/Admin/Notifications.jsx";
import Settings     from "./view/Admin/Settings.jsx";
import AdminProfile from "./view/Admin/Profile.jsx";

import InspectorLayout   from "./view/Inspector/InspectorLayout.jsx";
import Home              from "./view/Inspector/Home.jsx";
import VesselManagement  from "./view/Inspector/VesselManagement.jsx";
import InspectionManagement from "./view/Inspector/InspectionManagement.jsx";
import InspectionPart1   from "./view/Inspector/InspectionPart1.jsx";
import InspectionPart2   from "./view/Inspector/InspectionPart2.jsx";
import InspectionPart3   from "./view/Inspector/InspectionPart3.jsx";
import InspectionPhoto   from "./view/Inspector/InspectionPhoto.jsx";
import EditInspectionPart1 from "./view/Inspector/EditInspectionPart1.jsx";
import ReportManagement  from "./view/Inspector/ReportManagement.jsx";
import ReportView        from "./view/Inspector/ReportView.jsx";
import StatisticAnalysis from "./view/Inspector/StatisticAnalysis.jsx";
import TeamSharedReport  from "./view/Inspector/TeamSharedReport.jsx";
import Profile           from "./view/Inspector/Profile.jsx";
import InspectorSettings from "./view/Inspector/InspectorSettings.jsx";
import Menu              from "./view/Inspector/Menu.jsx";
import LoadingScreen     from "./components/LoadingScreen.jsx";

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/inspector"} replace />;
  }
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/register"       element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin", "facility_manager"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="users"         element={<Users />} />
          <Route path="vessels"       element={<Vessels />} />
          <Route path="reports"       element={<Reports />} />
          <Route path="analytics"     element={<Analytics />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="settings"      element={<Settings />} />
          <Route path="profile"       element={<AdminProfile />} />
        </Route>

        <Route
          path="/inspector"
          element={
            <ProtectedRoute allowedRoles={["inspector", "facility_manager"]}>
              <InspectorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="menu"                    element={<Menu />} />
          <Route path="vessels"                 element={<VesselManagement />} />
          <Route path="inspections"             element={<InspectionManagement />} />
          <Route path="inspections/new/part1"   element={<InspectionPart1 />} />
          <Route path="inspections/new/part2"   element={<InspectionPart2 />} />
          <Route path="inspections/new/part3"   element={<InspectionPart3 />} />
          <Route path="inspections/:id/photo"   element={<InspectionPhoto />} />
          <Route path="inspections/:id/edit"    element={<EditInspectionPart1 />} />
          <Route path="reports"                 element={<ReportManagement />} />
          <Route path="reports/:id"             element={<ReportView />} />
          <Route path="statistics"              element={<StatisticAnalysis />} />
          <Route path="team-reports"            element={<TeamSharedReport />} />
          <Route path="profile"                 element={<Profile />} />
          <Route path="settings"               element={<InspectorSettings />} />
        </Route>

        <Route
          path="/"
          element={
            user
              ? <Navigate to={user.role === "admin" ? "/admin" : "/inspector"} replace />
              : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}