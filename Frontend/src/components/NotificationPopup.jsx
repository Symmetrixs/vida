import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

const icons = {
  success: { icon: CheckCircle, cls: "text-green-500" },
  error:   { icon: AlertCircle, cls: "text-red-500" },
  warning: { icon: AlertTriangle, cls: "text-yellow-500" },
  info:    { icon: Info, cls: "text-blue-500" },
};

export default function NotificationPopup({ notifications = [], onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((n) => {
          const { icon: Icon, cls } = icons[n.type] || icons.info;
          return (
            <motion.div
              key={n.id}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0,  opacity: 1 }}
              exit={{   x: 80, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              className="pointer-events-auto card shadow-xl w-80 px-4 py-3 flex items-start gap-3"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${cls}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{n.title}</p>
                {n.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>}
              </div>
              <button onClick={() => onDismiss?.(n.id)} className="shrink-0 btn-ghost p-1 rounded-lg">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
