import express from "express";
import { nextRouter } from "./next/routes";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  publicState,
  fundAgreement,
  startAgent,
  submitProof,
  freshAgreement,
  exportEvidence,
  current,
  refresh,
  refundAgreement,
} from "./app";
import { runTamper } from "./tamper";
const app = express(),
  port = Number(process.env.PORT || 3106);
if (port !== 3106) throw new Error("Post and Paid is assigned port 3106.");
app.disable("x-powered-by");
app.use((req, res, next) => {
  const hostname = req.hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname))
    return res.status(403).json({ error: "Local workspace only." });
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.origin;
    if (
      origin &&
      !["http://localhost:3106", "http://127.0.0.1:3106"].includes(origin)
    )
      return res.status(403).json({ error: "Cross-origin action blocked." });
    if (!req.is("application/json"))
      return res.status(415).json({ error: "JSON actions only." });
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "24kb" }));
app.use("/api/next", nextRouter);
app.get("/api/state", (_req, res) => res.json(publicState()));
app.get("/api/refresh", async (_req, res) => {
  try {
    res.json(await refresh());
  } catch (e: any) {
    res.status(503).json({ error: e.shortMessage || e.message });
  }
});
app.get("/api/evidence", (_req, res) => res.json(exportEvidence(current())));
const handle =
  (fn: () => Promise<any>, message: string) => async (_req: any, res: any) => {
    try {
      const state = await fn();
      res.json({ message, state });
    } catch (e: any) {
      res.status(409).json({ error: e.shortMessage || e.message });
    }
  };
app.post(
  "/api/refund",
  handle(refundAgreement, "Unpaid collateral returned to the original brand."),
);
app.post(
  "/api/fund",
  handle(
    fundAgreement,
    "Agreement funded. The fee and delivery rules are now fixed.",
  ),
);
app.post(
  "/api/agent/start",
  handle(startAgent, "The agent finished its procurement and payment action."),
);
app.post(
  "/api/agreement/new",
  handle(
    freshAgreement,
    "A fresh agreement is ready. Previous chain receipts are preserved.",
  ),
);
app.post(
  "/api/tamper",
  handle(runTamper, "Rejection checks recorded against the deployed verifier."),
);
app.post("/api/proof", async (req, res) => {
  try {
    const state = await submitProof(req.body.response);
    res.json({
      message: "Signed response submitted and payment confirmed.",
      state,
    });
  } catch (e: any) {
    res.status(409).json({ error: e.shortMessage || e.message });
  }
});
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, product: "post-and-paid" }),
);
if (process.env.NODE_ENV === "production") {
  if (!existsSync(resolve("dist/index.html")))
    throw new Error("Run npm run build before production start.");
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host: "127.0.0.1", hmr: { port: 24686 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () =>
  console.log(`Post and Paid: http://127.0.0.1:${port}`),
);
