import { motion } from "framer-motion";

export default function LoadingScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-slate-950"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="flex flex-col items-center gap-6"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
      >
        <div className="relative w-20 h-20">
          <motion.div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-600 to-vida-accent shadow-xl"
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-3xl font-black tracking-tighter select-none">V</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-primary-700 dark:text-primary-300 tracking-wide">
            VIDA
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 tracking-widest uppercase">
            Visual Infrastructure Defect Analyzer
          </p>
        </div>

        <div className="flex gap-2 mt-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-primary-500"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
