import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { nextWallets } from '../server/next/config';
import { exclusiveNext, loadNext, saveNext, V2_LOCAL } from '../server/next/store';
import { writeJson } from '../server/store';

// Archive only the isolated browser QA scenario. Never reset a funded/paid job.
await exclusiveNext(async () => {
  const state = loadNext();
  assert(state?.campaign, 'No test scenario to archive.');
  assert.equal(state.campaign.creator.toLowerCase(), nextWallets().creatorTest.account.address.toLowerCase());
  assert.equal(state.campaign.authorId, '12');
  assert.equal(state.campaign.postId, '20');
  assert.equal(state.deployment, undefined);
  assert.equal(state.intake, undefined);
  assert.equal(state.mandate, undefined);
  assert.equal(state.receipts.length, 0);
  assert.equal(Object.keys(state.transactions).length, 0);
  assert.equal(state.status, 'consent-verified');
  const path = resolve(V2_LOCAL, 'archive', `${state.campaign.agreementId}-browser-qa.json`);
  writeJson(path, state);
  const evidence = {
    at: new Date().toISOString(),
    kind: 'Isolated test-wallet external-signature browser QA. No X-owner pilot, funding or payout.',
    agreementId: state.campaign.agreementId,
    consent: state.consent,
    sourcePurchased: false,
    escrowCreated: false,
    v1Changed: false,
    archivedForMorning: true,
  };
  writeJson('evidence/v2/browser-consent-verification.json', evidence);
  saveNext({
    status: 'empty',
    network: {name: 'Base Sepolia', chainId: 84532},
    receipts: [], events: [], transactions: {},
    pilot: {status: 'pending', detail: 'A creator must publish this campaign challenge from their own X account. No new creator pilot or payout has been completed.'},
  });
  console.log(JSON.stringify({archivedTestAgreement: evidence.agreementId, current: 'empty', receiptsPreserved: true}));
});
