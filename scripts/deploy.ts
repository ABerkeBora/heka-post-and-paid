import { fundAgreement } from "../server/app";
const state = await fundAgreement();
console.log(
  JSON.stringify(
    { status: state.status, deployment: state.deployment },
    null,
    2,
  ),
);
