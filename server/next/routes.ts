import { Router } from "express";
import {
  nextPublic,
  nextEvidence,
  newNextCampaign,
  pinNextPost,
  acceptNextConsent,
  checkNextIntake,
  fundNextAgreement,
  runNextAgent,
  refundNextAgreement,
} from "./app";
export const nextRouter = Router();
nextRouter.get("/state", (_req, res) => res.json(nextPublic()));
nextRouter.get("/evidence", (_req, res) => res.json(nextEvidence()));
nextRouter.get("/health", (_req, res) =>
  res.json({ ok: true, product: "post-and-paid", version: 2 }),
);
const action =
  (fn: (body: any) => Promise<any>, message: string) =>
  async (req: any, res: any) => {
    try {
      res.json({ message, state: await fn(req.body) });
    } catch (e: any) {
      res.status(409).json({ error: e.shortMessage || e.message });
    }
  };
nextRouter.post(
  "/campaign",
  action(
    (body) =>
      newNextCampaign({ creator: body.creator, authorId: body.authorId }),
    "Campaign challenge created. Publish it from the pinned creator account.",
  ),
);
nextRouter.post(
  "/post",
  action(
    (body) => pinNextPost(body.postId),
    "Post pinned. Read and sign the complete campaign terms.",
  ),
);
nextRouter.post(
  "/consent",
  action(
    (body) => acceptNextConsent(body.signature),
    "Creator wallet consent verified; social binding still needs the signed post.",
  ),
);
nextRouter.post(
  "/intake",
  action(
    () => checkNextIntake(),
    "Signed post intake verified. These consented terms can now be funded.",
  ),
);
nextRouter.post(
  "/fund",
  action(() => fundNextAgreement(), "Consented creator agreement funded."),
);
nextRouter.post(
  "/agent/start",
  action(
    () => runNextAgent(),
    "The bounded procurement and payout action is confirmed.",
  ),
);
nextRouter.post(
  "/refund",
  action(
    () => refundNextAgreement(),
    "Unpaid creator fee returned to the original brand.",
  ),
);
