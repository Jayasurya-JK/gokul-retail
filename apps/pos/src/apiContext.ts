import { createContext, useContext } from "react";
import * as realApi from "./api";

/** Every call to Rust goes through this object, so tests can pass a fake. */
export type Api = typeof realApi;

export const ApiContext = createContext<Api>(realApi);

export function useApi(): Api {
  return useContext(ApiContext);
}
