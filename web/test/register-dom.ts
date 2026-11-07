import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Component tests render client components outside Next. Register a DOM
// before testing-library loads so `document` exists at import time.
if (typeof globalThis.document === "undefined") {
  GlobalRegistrator.register();
}
