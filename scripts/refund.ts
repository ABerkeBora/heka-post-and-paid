import { refundAgreement } from "../server/app";
console.log(JSON.stringify(await refundAgreement(), null, 2));
