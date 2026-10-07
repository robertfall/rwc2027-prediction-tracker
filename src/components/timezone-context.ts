import { createContext, useContext, type Accessor } from "solid-js";
import { systemTimeZone } from "../state/timezone-preference";

export const TimeZoneContext = createContext<Accessor<string>>(systemTimeZone);
export const useTimeZone = () => useContext(TimeZoneContext);
