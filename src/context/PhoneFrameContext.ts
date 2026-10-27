import { createContext, useContext } from "react";

export const PhoneFrameContext = createContext<HTMLElement | null>(null);
export const usePortalTarget = () => useContext(PhoneFrameContext);
