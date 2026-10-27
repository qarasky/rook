import type { Transition } from "framer-motion";

// Motion is for overlays (dialogs, menus, popovers, toasts) and for layout shifts. Content that
// is simply replaced (switching tabs, files or repos) is never faded: fading from zero makes
// frequent clicks flicker. MotionConfig in App.tsx turns movement off when the OS asks for it.
export const spring: Transition = { type: "spring", stiffness: 520, damping: 40 };
export const ease: Transition = { duration: 0.14, ease: [0.2, 0, 0, 1] };
