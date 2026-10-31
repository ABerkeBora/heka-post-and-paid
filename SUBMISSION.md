# Post and Paid — sunum ve başvuru taslağı

Seçilen track yalnız **API3 — Any API in your contract**. Bu dosya hazırlık metnidir; yarışma başvurusu gönderilmedi. En fazla 2,5 dakikalık video henüz kaydedilmedi. Resmî genel kurallar bir takım için tek başvuru ve en fazla üç partner track'i öngörüyor; yedi bağımsız aday, yedi ayrı takım başvurusu izni anlamına gelmez. Yayımlanan son saat **31 Ekim 2026 15.00 Europe/Berlin**; gönderim öncesi [resmî sayfayı](https://hackathon.tum-blockchain.com/prizes#how-to-submit) yeniden kontrol edin.

## 2 dakika 30 saniyelik gösterim

| Süre | Ekran ve anlatım |
| --- | --- |
| 0.00–0.20 | Agreement ekranı: “Marka tek gönderinin ücretini baştan kilitliyor. Agent'a bir kez sınırlı satın alma yetkisi veriliyor.” Creator adresini, sabit ücreti ve teslim kurallarını göster. Tarihî gerçek postun yalnız teknik test senaryosu olduğunu tek cümleyle belirt. |
| 0.20–0.40 | Yeni fonlanan anlaşmada **Start procurement agent**: modelin izinli `purchase_snapshot` önerisi ve 0.01 aUSD bütçesi. “Model anahtar, alıcı veya calldata seçmiyor.” |
| 0.40–1.05 | Payment trail: gerçek x402 veri receipt'i, imzalı snapshot, sabit request ve signer. “Veri ücreti creator ücretinden ayrı.” |
| 1.05–1.25 | Contract doğrulaması ve creator payout receipt'i. Explorer'da `CreatorPaid` ve `10000000000000` wei beneficiary artışını göster. “Agent, ilk yetkiden sonra proof'u kendisi sundu; ikinci bir ödeme tıklaması yok.” |
| 1.25–2.05 | **Check proof protections** veya kayıtlı dört receipt: değiştirilmiş veri, başka istek, yanlış signer, değiştirilmeden bekletilmiş eski response. Korunan harness state ve bakiyesini göster. Test harness'ının 30 saniye freshness/180 saniye deadline kullandığını belirt. |
| 2.05–2.20 | Duplicate/restart ve 10001 > 10000 birim bütçe reddi. Sonra harness'ın deadline refund receipt'ini göster. “API ücreti ve revert gas'ı harcanmış olabilir; escrow reddedilen proof ile açılmaz.” |
| 2.20–2.30 | Güven sınırı: “İmza kaynak snapshot'ını doğrular. Sürekli yayın, kampanya kalitesi veya hesap–cüzdan sahipliği garantisi vermez.” Repo ve contract bağlantısı. |

Kayıt öncesi yeni anlaşmayı hazırlayın; canlı pozitif akışta 300 saniyelik snapshot tazeliği gerekir. Yeni rejection harness için `npm run scenario` kaynak alımından önce harness'ı deploy eder. Eski receipt'ler dürüstçe geçmiş kanıt olarak gösterilebilir; eski response'u yeni başarılı işlem gibi sunmayın. Video 2.30'u aşmamalı.

## English submission copy

**Name:** Post and Paid

**One sentence:** A bounded agent buys signed post evidence and triggers a fixed creator payment when an immutable agreement's delivery rules pass.

**Problem and users**

Brands and creators can disagree about whether a paid post met a narrow technical brief. Screenshots are editable, and a brand-operated backend can become the sole authority for withholding payment. Post and Paid explores a smaller, verifiable agreement: one post, one fixed beneficiary, one fee and delivery conditions pinned before funding.

**What we built**

A local application on Base Sepolia lets a brand fund an immutable escrow and authorize a procurement agent once. A local model produces a structured proposal using an allowed action set. Deterministic execution buys a `tweetsByIds` snapshot from the TwitterAPI Airnode over x402, paying 0.01 test aUSD. It preserves the signed response bytes and submits them to the escrow. The contract verifies the pinned Airnode signer, its on-chain-derived exact request hash, signature freshness, post and author IDs, the required substring and publication window. A valid response releases the fixed fee to the creator automatically. The contract prevents a second payout and permits the original brand to refund unpaid collateral after the deadline.

The agent cannot choose arbitrary recipients, assets, operations or calldata. The local executor enforces integer API/gas budgets, expiry and a maximum action count. Durable payment intents and signed transaction records reconcile retries instead of creating a second authorization or payout. These application limits are distinguished from the contract's on-chain payout protections.

**Why API3 is essential**

The creator fee cannot be released without authenticated Airnode data. The signed response drives the actual escrow payment, rather than appearing only in a dashboard. The contract trusts the source signer and request policy selected before funding, independently of the app or model.

**Data we wanted but did not find**

We did not find an operation in the selected AirnodeHub listing that establishes continuous publication history, an independent upstream observation timestamp, or social-account-to-wallet ownership. We therefore implemented a single signed snapshot with a pinned publication window, and make no seven-day retention or ownership claim.

**Working evidence**

The recorded flow purchased a real signed snapshot and paid `10000000000000` wei (0.00001 test ETH) to its fixed test beneficiary. Four real reverting transactions demonstrate edited-data, different-request, wrong-signer and stale-response rejection while protected state and collateral remain unchanged. Separate evidence covers over-budget rejection, duplicate/restart protection, and the expired harness refund. All amounts use test assets. A separate source preflight cost 0.01 aUSD, and rejected transactions incurred test gas; those costs are disclosed.

**Trust and limitations**

The scenario uses historical public X post 20, not a commissioned advertisement. Its author account's association with the isolated creator wallet is a brand-supplied input; account ownership and creator consent are not proven. API3's signature authenticates the exact source response, while X, TwitterAPI.io and the Airnode's accuracy and availability remain trust assumptions. A snapshot does not establish continuous publication, campaign quality, engagement or advertising compliance. Missing source fields and unsigned HTTP errors cannot authorize payment. The local model is outside settlement authority and never sees keys.

**Links**

- [Source and setup](https://github.com/ABerkeBora/heka-post-and-paid)
- Network: Base Sepolia, chain ID 84532
- [Contract](https://sepolia.basescan.org/address/0xffb396146f2443210b93ecb98c122e6a52484117)
- [Data payment](https://sepolia.basescan.org/tx/0x07d721e18281e1bcf81a415a77c6628bd9e528a7d4bc9210c2261a683a5921d2)
- [Creator payout](https://sepolia.basescan.org/tx/0x602a028d9159e4a4ac6943046c20e31484a04329ddf4c2e6e4876e379e993dbd)
- Complete proof and rejection receipts: repository `evidence/live-flow.json` and `evidence/tamper.json`
- Video: **PENDING — record and add an at-most-2.5-minute URL before submitting.**

## Gönderimden önce kalan işler

Videoyu kaydet ve bağlantısını ekle; takımın hangi tek adayı sunacağına karar ver; README/public repo erişimini ve son resmî kural kontrolünü doğrula. Devfolio metnini inceleyip yalnız kullanıcının ayrıca verdiği başvuru yetkisiyle gönder. Hazır taslak ile gönderilmiş yarışma başvurusu ayrı durumlardır.
