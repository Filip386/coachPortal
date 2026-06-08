import { createContext, useContext } from "react";

// Provides the phone-frame DOM element as a portal target on desktop.
// Null on mobile (no phone frame wrapper exists).
export const PhoneFrameContext = createContext<HTMLElement | null>(null);
export const usePortalTarget = () => useContext(PhoneFrameContext);
